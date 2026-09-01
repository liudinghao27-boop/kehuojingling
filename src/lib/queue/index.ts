/**
 * 任务队列模块
 *
 * 职责：
 * - 评论抓取队列
 * - 自动回复队列（接入账号池 + 合规检查）
 * - 自动私信队列（接入账号池 + 合规检查）
 * - 监控调度队列
 * - 账号维护定时任务（日额度重置、冷却恢复）
 */

import Bull from 'bull';
import Redis from 'ioredis';
import { prisma } from '../db';
import { scrapeAndSaveComments } from '../scraper';
import {
  pickAccount,
  claimAccountSlot,
  handleSendSuccess,
  handleSendFailure,
  recoverCoolingAccounts,
  resetDailySentCounts,
  resolveAccountCookies,
} from '../sender/account-pool';
import { checkCompliance, generateCompliantVariant, getNextSafeSendTime, isSafeSendTime } from '../safety/compliance';
import { getSenderProvider } from '../sender';
import { Platform } from '@prisma/client';
import type { Reply } from '@prisma/client';

// ---------------------------------------------------------------------------
// Redis 连接
// ---------------------------------------------------------------------------

function getRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  return `redis://${host}:${port}`;
}

async function checkRedisAvailable(): Promise<boolean> {
  const client = new Redis(getRedisUrl(), {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
  });

  client.on('error', () => {});

  try {
    await Promise.race([
      client.connect().then(() => client.ping()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
      ),
    ]);
    return true;
  } catch (error) {
    console.warn(
      '[Queue] Redis is not available, switching to direct execution mode.',
      (error as Error).message
    );
    return false;
  } finally {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// 队列状态
// ---------------------------------------------------------------------------

interface QueueState {
  enabled: boolean;
  scrapeQueue: Bull.Queue | null;
  replyQueue: Bull.Queue | null;
  dmQueue: Bull.Queue | null;
  monitorQueue: Bull.Queue | null;
  maintenanceQueue: Bull.Queue | null;
}

let queueState: QueueState | null = null;
let initPromise: Promise<QueueState> | null = null;

// ---------------------------------------------------------------------------
// 定时任务初始化
// ---------------------------------------------------------------------------

async function initMonitorSchedule(monitorQueue: Bull.Queue) {
  try {
    const repeatableJobs = await monitorQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await monitorQueue.removeRepeatableByKey(job.key);
    }

    await monitorQueue.add(
      'cycle',
      {},
      {
        repeat: { cron: '*/10 * * * *' },
        removeOnComplete: true,
      }
    );

    console.log('[Monitor] Schedule initialized: every 10 minutes');
  } catch (error) {
    console.error('[Monitor] Failed to initialize schedule:', error);
  }
}

async function initMaintenanceSchedule(maintenanceQueue: Bull.Queue) {
  try {
    const repeatableJobs = await maintenanceQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await maintenanceQueue.removeRepeatableByKey(job.key);
    }

    // 每日 0 点重置发送计数
    await maintenanceQueue.add(
      'reset-daily-sent',
      {},
      {
        repeat: { cron: '0 0 * * *' },
        removeOnComplete: true,
      }
    );

    // 每小时恢复冷却账号
    await maintenanceQueue.add(
      'recover-cooling-accounts',
      {},
      {
        repeat: { cron: '0 * * * *' },
        removeOnComplete: true,
      }
    );

    console.log('[Maintenance] Schedule initialized: daily reset + hourly recovery');
  } catch (error) {
    console.error('[Maintenance] Failed to initialize schedule:', error);
  }
}

// ---------------------------------------------------------------------------
// 发送处理器（回复/私信共用）
// ---------------------------------------------------------------------------

export interface SendJobData {
  commentId: string;
  /** 路由入队时已创建的 Reply.id / Dm.id，发送结果复用更新同一行 */
  recordId: string;
  accountId?: string;
  priority?: number;
}

/** 把任务对应的 Reply/Dm 行标记为失败（复用同一行，供 Bull 重试时再次更新） */
async function markRecordFailed(type: 'reply' | 'dm', recordId: string) {
  if (type === 'reply') {
    await prisma.reply.update({ where: { id: recordId }, data: { status: 'FAILED' } });
  } else {
    await prisma.dm.update({ where: { id: recordId }, data: { status: 'FAILED' } });
  }
}

export async function processSendJob(
  job: Bull.Job<SendJobData>,
  type: 'reply' | 'dm'
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  const { commentId, recordId, accountId } = job.data;
  const logPrefix = type === 'reply' ? '[Reply]' : '[DM]';

  console.log(`${logPrefix} Processing comment ${commentId}, record ${recordId}`);

  // 1. 获取评论、视频、用户信息
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      video: {
        include: { user: true },
      },
    },
  });

  if (!comment) {
    throw new Error(`评论不存在: ${commentId}`);
  }

  const userId = comment.video.userId;
  const platform = comment.video.platform as Platform;

  // 2. 取出发送内容与上下文（内容在路由入队时已写入 Reply/Dm 行）
  const record = type === 'reply'
    ? await prisma.reply.findUnique({ where: { id: recordId } })
    : await prisma.dm.findUnique({ where: { id: recordId } });

  if (!record || record.commentId !== commentId) {
    throw new Error(`发送记录不存在或与评论不匹配: ${recordId}`);
  }
  // 种草标识（仅回复有 mode 字段），用于活动记录描述
  const mode: string | null = type === 'reply' ? (record as Reply).mode : null;

  // 3. 幂等：该评论已有同类型 SENT 记录则短路跳过（防 Bull 重试/重复入队导致重发）
  const existingSent = type === 'reply'
    ? await prisma.reply.findFirst({ where: { commentId, status: 'SENT' } })
    : await prisma.dm.findFirst({ where: { commentId, status: 'SENT' } });

  if (existingSent) {
    console.log(`${logPrefix} 评论 ${commentId} 已有成功记录，跳过重复发送`);
    if (existingSent.id !== record.id && record.status === 'PENDING') {
      // 清掉本次重复入队的冗余行，避免永远挂在 PENDING
      if (type === 'reply') {
        await prisma.reply.delete({ where: { id: record.id } });
      } else {
        await prisma.dm.delete({ where: { id: record.id } });
      }
    }
    return { success: true, skipped: true, reason: 'already-sent' };
  }

  let sendContent = record.content;

  // 4. 合规检查（兜底安全网：路由已拦截，此处防入队后内容被改等缝隙）
  const compliance = checkCompliance(sendContent);
  if (!compliance.compliant) {
    console.warn(`${logPrefix} 内容合规拦截: ${compliance.issues.join('；')}`);

    // 尝试自动改写
    const sanitized = generateCompliantVariant(sendContent);
    const sanitizedCheck = checkCompliance(sanitized);

    if (!sanitizedCheck.compliant) {
      // 改写后仍不合规，记录失败并跳过（复用同一行，不新增记录）
      await markRecordFailed(type, record.id);
      await prisma.activity.create({
        data: {
          type: 'ERROR',
          description: `内容合规拦截: ${compliance.issues.join('；')}`,
          metadata: { commentId, recordId, originalContent: record.content },
          userId,
        },
      });
      return { success: false, skipped: true, reason: 'compliance' };
    }

    sendContent = sanitized;
    // 落库内容与实发内容保持一致
    if (type === 'reply') {
      await prisma.reply.update({ where: { id: record.id }, data: { content: sendContent } });
    } else {
      await prisma.dm.update({ where: { id: record.id }, data: { content: sendContent } });
    }
    console.log(`${logPrefix} 内容已自动改写为合规变体`);
  }

  // 5. 选择发送账号并原子认领当日额度（显式指定账号同样走认领，口径一致）
  const account = accountId
    ? await claimAccountSlot(accountId)
    : await pickAccount({ userId, platform });

  if (!account) {
    // 无可用账号，延迟重试
    console.warn(`${logPrefix} 无可用发送账号，任务将重试`);
    throw new Error('无可用发送账号，请检查账号池状态');
  }

  console.log(`${logPrefix} 使用账号: ${account.label} (健康度: ${account.healthScore})`);

  // 6. 检查是否在安全发送窗口
  // WHY: getNextSafeSendTime() 在安全窗口内也会返回 5-30 分钟后的时间（拟人抖动），
  // 这部分抖动已由入队时的 delay 与 Bull limiter 覆盖，若按返回值直接推迟，
  // 每条消息都会被无谓地二次延迟 5-30 分钟。因此用 isSafeSendTime() 判断窗口，
  // 仅在窗口外才把任务推迟到 getNextSafeSendTime() 给出的下一个安全窗口。
  if (!isSafeSendTime()) {
    const safeTime = getNextSafeSendTime();
    const delayMs = safeTime.getTime() - Date.now();
    console.log(`${logPrefix} 当前非安全发送窗口，推迟 ${Math.round(delayMs / 60000)} 分钟`);

    // Bull v4 运行时支持 moveToDelayed（见 bull/lib/job.js），但其 index.d.ts 未声明；
    // 且 Redis 不可用的直接执行模式没有 Bull job。因此做能力检测 + 失败降级，
    // 不能让发送链路因调度问题崩溃。
    const moveToDelayed = (job as { moveToDelayed?: (timestamp: number) => Promise<void> }).moveToDelayed;
    if (typeof moveToDelayed === 'function') {
      try {
        await moveToDelayed.call(job, safeTime.getTime());
        return { success: false, skipped: true, reason: 'outside-safe-window' };
      } catch (error) {
        console.error(`${logPrefix} 任务推迟失败，降级为立即发送:`, error);
      }
    } else {
      console.warn(`${logPrefix} 当前环境不支持任务推迟（无 Bull job），降级为立即发送`);
    }
  }

  // 7. 执行发送
  const provider = getSenderProvider(platform);
  if (!provider) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  const sendParams = {
    userId,
    platform,
    videoUrl: comment.video.url,
    commentId,
    content: sendContent,
    authorName: comment.authorName,
    commentContent: comment.content,
    credentials: {
      // cookies 入库时已加密（AES-256-GCM），发送前解密；历史明文数据由 resolveAccountCookies 兼容
      cookies: resolveAccountCookies(account.cookies),
      // 账号配置了独立代理时下传给 provider，用于出口 IP 隔离；未配置则不加该键
      ...(account.proxyUrl ? { proxyUrl: account.proxyUrl } : {}),
    },
  };

  const result = type === 'reply'
    ? await provider.sendReply(sendParams)
    : await provider.sendDm(sendParams);

  // 8. 结果处理：复用入队时创建的同一行，成功/失败都只更新不新建
  if (result.success) {
    await handleSendSuccess(account.id);

    if (type === 'reply') {
      await prisma.reply.update({
        where: { id: record.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'REPLIED' },
      });
    } else {
      await prisma.dm.update({
        where: { id: record.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'DM_SENT' },
      });
    }

    // 记录活动
    await prisma.activity.create({
      data: {
        type: type === 'reply' ? 'REPLY_SENT' : 'DM_SENT',
        description:
          type === 'dm'
            ? `私信了用户 ${comment.authorName}`
            : mode === 'seed'
              ? `种草回复了用户 ${comment.authorName}`
              : `回复了用户 ${comment.authorName}`,
        metadata: {
          commentId,
          recordId,
          mode,
          accountId: account.id,
          accountLabel: account.label,
        },
        userId,
      },
    });

    console.log(`${logPrefix} 发送成功`);
    return { success: true };
  }

  // 发送失败
  const { shouldCooling } = await handleSendFailure({
    accountId: account.id,
    error: result.error ?? '未知错误',
  });

  // 复用同一行记录失败，Bull 重试时基于同一行再次尝试
  await markRecordFailed(type, record.id);

  if (shouldCooling) {
    console.warn(`${logPrefix} 账号 ${account.label} 触发熔断，进入冷却`);
  }

  throw new Error(result.error ?? '发送失败');
}

// ---------------------------------------------------------------------------
// 队列初始化
// ---------------------------------------------------------------------------

async function initializeQueues(): Promise<QueueState> {
  const redisAvailable = await checkRedisAvailable();

  if (!redisAvailable) {
    console.warn(
      '[Queue] Running without Redis. Immediate scrape will be executed directly; auto-reply is disabled.'
    );
    return {
      enabled: false,
      scrapeQueue: null,
      replyQueue: null,
      dmQueue: null,
      monitorQueue: null,
      maintenanceQueue: null,
    };
  }

  const bullRedis = getRedisUrl();

  const scrapeQueue = new Bull('scrape', { redis: bullRedis });
  const replyQueue = new Bull('reply', {
    redis: bullRedis,
    limiter: { max: 10, duration: 60000 }, // 每分钟最多 10 条
  });
  const dmQueue = new Bull('dm', {
    redis: bullRedis,
    limiter: { max: 5, duration: 60000 }, // 每分钟最多 5 条
  });
  const monitorQueue = new Bull('monitor', { redis: bullRedis });
  const maintenanceQueue = new Bull('maintenance', { redis: bullRedis });

  // 抓取队列
  scrapeQueue.process(async (job) => {
    const { videoId, url } = job.data;
    // 只有 Bull 最终一次尝试失败才递增视频连续失败计数，
    // 避免单周期内的自动重试直接把视频打成 ERROR
    const attempts = job.opts.attempts ?? 1;
    return scrapeAndSaveComments(videoId, url, {
      isFinalAttempt: job.attemptsMade >= attempts - 1,
    });
  });

  // 回复队列
  replyQueue.process(async (job) => {
    return processSendJob(job, 'reply');
  });

  // 私信队列
  dmQueue.process(async (job) => {
    return processSendJob(job, 'dm');
  });

  // 监控队列
  monitorQueue.process(async () => {
    const videos = await prisma.video.findMany({
      where: { status: 'MONITORING' },
      select: { id: true, url: true },
    });

    console.log(`[Monitor] Scheduling scrape for ${videos.length} videos`);

    for (const video of videos) {
      await addScrapeJob(video.id, video.url);
    }

    return { scheduled: videos.length };
  });

  // 维护队列
  maintenanceQueue.process('reset-daily-sent', async () => {
    const count = await resetDailySentCounts();
    console.log(`[Maintenance] Reset daily sent count for ${count} accounts`);
    return { reset: count };
  });

  maintenanceQueue.process('recover-cooling-accounts', async () => {
    const count = await recoverCoolingAccounts();
    console.log(`[Maintenance] Recovered ${count} cooling accounts`);
    return { recovered: count };
  });

  await initMonitorSchedule(monitorQueue);
  await initMaintenanceSchedule(maintenanceQueue);

  return {
    enabled: true,
    scrapeQueue,
    replyQueue,
    dmQueue,
    monitorQueue,
    maintenanceQueue,
  };
}

async function getQueueState(): Promise<QueueState> {
  if (queueState) return queueState;
  if (!initPromise) {
    initPromise = initializeQueues().then((state) => {
      queueState = state;
      return state;
    });
  }
  return initPromise;
}

// ---------------------------------------------------------------------------
// 导出接口
// ---------------------------------------------------------------------------

export async function addScrapeJob(videoId: string, url: string) {
  const state = await getQueueState();

  if (state.enabled && state.scrapeQueue) {
    return state.scrapeQueue.add(
      { videoId, url },
      {
        delay: 5000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
      }
    );
  }

  setTimeout(() => {
    scrapeAndSaveComments(videoId, url).catch((error) => {
      console.error(`[Queue] Direct scrape failed for ${videoId}:`, error);
    });
  }, 5000);

  return { id: 'direct', data: { videoId, url } };
}

export async function addReplyJob(commentId: string, recordId: string, accountId?: string) {
  const state = await getQueueState();

  if (state.enabled && state.replyQueue) {
    return state.replyQueue.add(
      { commentId, recordId, accountId },
      {
        delay: 30000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
      }
    );
  }

  // Redis 不可用时降级为直接异步执行，避免回复记录永远挂在 PENDING（与 addScrapeJob 降级一致）
  console.warn('[Queue] Redis not available, executing reply job directly');
  setTimeout(() => {
    processSendJob(
      { data: { commentId, recordId, accountId } } as Bull.Job<SendJobData>,
      'reply'
    ).catch((error) => {
      console.error(`[Queue] Direct reply send failed for comment ${commentId}:`, error);
    });
  }, 30000);

  return { id: 'direct', data: { commentId, recordId, accountId } };
}

export async function addDmJob(commentId: string, recordId: string, accountId?: string) {
  const state = await getQueueState();

  if (state.enabled && state.dmQueue) {
    return state.dmQueue.add(
      { commentId, recordId, accountId },
      {
        delay: 60000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 120000 },
      }
    );
  }

  // Redis 不可用时降级为直接异步执行，避免私信记录永远挂在 PENDING
  console.warn('[Queue] Redis not available, executing DM job directly');
  setTimeout(() => {
    processSendJob(
      { data: { commentId, recordId, accountId } } as Bull.Job<SendJobData>,
      'dm'
    ).catch((error) => {
      console.error(`[Queue] Direct DM send failed for comment ${commentId}:`, error);
    });
  }, 60000);

  return { id: 'direct', data: { commentId, recordId, accountId } };
}
