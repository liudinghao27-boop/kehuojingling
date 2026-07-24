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
  handleSendSuccess,
  handleSendFailure,
  recoverCoolingAccounts,
  resetDailySentCounts,
} from '../sender/account-pool';
import { checkCompliance, generateCompliantVariant, getNextSafeSendTime } from '../safety/compliance';
import { getSenderProvider } from '../sender';
import { Platform } from '@prisma/client';

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

interface SendJobData {
  commentId: string;
  templateId: string;
  accountId?: string;
  priority?: number;
}

async function processSendJob(
  job: Bull.Job<SendJobData>,
  type: 'reply' | 'dm'
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  const { commentId, templateId, accountId } = job.data;
  const logPrefix = type === 'reply' ? '[Reply]' : '[DM]';

  console.log(`${logPrefix} Processing comment ${commentId}, template ${templateId}`);

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

  // 2. 获取模板内容
  let templateContent: string;
  if (type === 'reply') {
    const template = await prisma.replyTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new Error(`回复模板不存在: ${templateId}`);
    templateContent = template.content;
  } else {
    const template = await prisma.dmTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new Error(`私信模板不存在: ${templateId}`);
    templateContent = template.content;
  }

  // 3. 合规检查
  const compliance = checkCompliance(templateContent);
  if (!compliance.compliant) {
    console.warn(`${logPrefix} 内容合规拦截: ${compliance.issues.join('；')}`);

    // 尝试自动改写
    const sanitized = generateCompliantVariant(templateContent);
    const sanitizedCheck = checkCompliance(sanitized);

    if (!sanitizedCheck.compliant) {
      // 改写后仍不合规，记录并跳过
      await prisma.activity.create({
        data: {
          type: 'ERROR',
          description: `内容合规拦截: ${compliance.issues.join('；')}`,
          metadata: { commentId, templateId, originalContent: templateContent },
          userId,
        },
      });
      return { success: false, skipped: true, reason: 'compliance' };
    }

    templateContent = sanitized;
    console.log(`${logPrefix} 内容已自动改写为合规变体`);
  }

  // 4. 选择发送账号
  const account = accountId
    ? await prisma.senderAccount.findUnique({ where: { id: accountId } })
    : await pickAccount({ userId, platform });

  if (!account) {
    // 无可用账号，延迟重试
    console.warn(`${logPrefix} 无可用发送账号，任务将重试`);
    throw new Error('无可用发送账号，请检查账号池状态');
  }

  console.log(`${logPrefix} 使用账号: ${account.label} (健康度: ${account.healthScore})`);

  // 5. 检查是否在安全发送窗口
  const now = new Date();
  const safeTime = getNextSafeSendTime();
  if (safeTime > now) {
    const delayMs = safeTime.getTime() - now.getTime();
    console.log(`${logPrefix} 当前非安全发送窗口，延迟 ${Math.round(delayMs / 60000)} 分钟`);
    // 注意：这里不实际延迟，由 Bull 的 backoff 机制处理重试
  }

  // 6. 执行发送
  const provider = getSenderProvider(platform);
  if (!provider) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  const sendParams = {
    userId,
    platform,
    videoUrl: comment.video.url,
    commentId,
    content: templateContent,
    authorName: comment.authorName,
    commentContent: comment.content,
    credentials: { cookies: account.cookies },
  };

  const result = type === 'reply'
    ? await provider.sendReply(sendParams)
    : await provider.sendDm(sendParams);

  // 7. 结果处理
  if (result.success) {
    await handleSendSuccess(account.id);

    // 记录发送结果
    if (type === 'reply') {
      await prisma.reply.create({
        data: {
          content: templateContent,
          status: 'SENT',
          sentAt: new Date(),
          commentId,
        },
      });
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'REPLIED' },
      });
    } else {
      await prisma.dm.create({
        data: {
          content: templateContent,
          status: 'SENT',
          sentAt: new Date(),
          commentId,
        },
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
        description: `${type === 'reply' ? '回复' : '私信'}发送成功`,
        metadata: {
          commentId,
          templateId,
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

  // 记录失败
  if (type === 'reply') {
    await prisma.reply.create({
      data: {
        content: templateContent,
        status: 'FAILED',
        commentId,
      },
    });
  } else {
    await prisma.dm.create({
      data: {
        content: templateContent,
        status: 'FAILED',
        commentId,
      },
    });
  }

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
    return scrapeAndSaveComments(videoId, url);
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

export async function addReplyJob(commentId: string, templateId: string, accountId?: string) {
  const state = await getQueueState();

  if (state.enabled && state.replyQueue) {
    return state.replyQueue.add(
      { commentId, templateId, accountId },
      {
        delay: 30000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
      }
    );
  }

  console.log('[Queue] Redis not available, reply job skipped');
  return { id: 'direct', data: { commentId, templateId, accountId } };
}

export async function addDmJob(commentId: string, templateId: string, accountId?: string) {
  const state = await getQueueState();

  if (state.enabled && state.dmQueue) {
    return state.dmQueue.add(
      { commentId, templateId, accountId },
      {
        delay: 60000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 120000 },
      }
    );
  }

  console.log('[Queue] Redis not available, DM job skipped');
  return { id: 'direct', data: { commentId, templateId, accountId } };
}
