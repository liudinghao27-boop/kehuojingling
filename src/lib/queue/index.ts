import Bull from 'bull';
import Redis from 'ioredis';
import { randomDelay } from '../safety/compliance';
import { prisma } from '../db';
import { scrapeAndSaveComments } from '../scraper';

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

  // 探测阶段的连接错误不需要抛出，避免打印未处理的 error 事件
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
      // ignore disconnect errors
    }
  }
}

interface QueueState {
  enabled: boolean;
  scrapeQueue: Bull.Queue | null;
  replyQueue: Bull.Queue | null;
  dmQueue: Bull.Queue | null;
  monitorQueue: Bull.Queue | null;
}

let queueState: QueueState | null = null;
let initPromise: Promise<QueueState> | null = null;

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
    };
  }

  const bullRedis = getRedisUrl();

  const scrapeQueue = new Bull('scrape', { redis: bullRedis });
  const replyQueue = new Bull('reply', { redis: bullRedis });
  const dmQueue = new Bull('dm', { redis: bullRedis });
  const monitorQueue = new Bull('monitor', { redis: bullRedis });

  scrapeQueue.process(async (job) => {
    const { videoId, url } = job.data;
    return scrapeAndSaveComments(videoId, url);
  });

  replyQueue.process(async (job) => {
    const { commentId } = job.data;
    console.log(`[Reply] Processing comment ${commentId}`);

    await randomDelay(30000, 120000);

    try {
      await prisma.reply.create({
        data: {
          content: '自动回复内容',
          status: 'SENT',
          sentAt: new Date(),
          commentId,
        },
      });

      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'REPLIED' },
      });

      return { success: true };
    } catch (error) {
      console.error(`[Reply] Failed for comment ${commentId}:`, error);
      await prisma.reply.create({
        data: {
          content: '自动回复内容',
          status: 'FAILED',
          commentId,
        },
      });
      throw error;
    }
  });

  dmQueue.process(async (job) => {
    const { commentId } = job.data;
    console.log(`[DM] Processing comment ${commentId}`);

    await randomDelay(60000, 180000);

    try {
      await prisma.dm.create({
        data: {
          content: '自动私信内容',
          status: 'SENT',
          sentAt: new Date(),
          commentId,
        },
      });

      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'DM_SENT' },
      });

      return { success: true };
    } catch (error) {
      console.error(`[DM] Failed for comment ${commentId}:`, error);
      await prisma.dm.create({
        data: {
          content: '自动私信内容',
          status: 'FAILED',
          commentId,
        },
      });
      throw error;
    }
  });

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

  await initMonitorSchedule(monitorQueue);

  return {
    enabled: true,
    scrapeQueue,
    replyQueue,
    dmQueue,
    monitorQueue,
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

// 添加任务到队列（Redis 不可用时直接执行）
export async function addScrapeJob(videoId: string, url: string) {
  const state = await getQueueState();

  if (state.enabled && state.scrapeQueue) {
    return state.scrapeQueue.add(
      { videoId, url },
      {
        delay: 5000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      }
    );
  }

  // 直接执行：模拟队列的 5 秒延迟
  setTimeout(() => {
    scrapeAndSaveComments(videoId, url).catch((error) => {
      console.error(`[Queue] Direct scrape failed for ${videoId}:`, error);
    });
  }, 5000);

  return { id: 'direct', data: { videoId, url } };
}

export async function addReplyJob(commentId: string, templateId: string) {
  const state = await getQueueState();

  if (state.enabled && state.replyQueue) {
    return state.replyQueue.add(
      { commentId, templateId },
      {
        delay: 30000,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 60000,
        },
      }
    );
  }

  console.log('[Queue] Redis not available, reply job skipped');
  return { id: 'direct', data: { commentId, templateId } };
}

export async function addDmJob(commentId: string, templateId: string) {
  const state = await getQueueState();

  if (state.enabled && state.dmQueue) {
    return state.dmQueue.add(
      { commentId, templateId },
      {
        delay: 60000,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 120000,
        },
      }
    );
  }

  console.log('[Queue] Redis not available, DM job skipped');
  return { id: 'direct', data: { commentId, templateId } };
}
