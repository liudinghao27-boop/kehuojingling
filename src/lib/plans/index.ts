import { prisma } from '../db';

export const PLAN_LIMITS = {
  FREE: {
    maxVideos: 3,
    dailyReplies: 10,
    dailyDms: 10,
    dailyAiResearch: 5,
  },
  BASIC: {
    maxVideos: 10,
    dailyReplies: 50,
    dailyDms: 50,
    dailyAiResearch: 20,
  },
  PRO: {
    maxVideos: 30,
    dailyReplies: 200,
    dailyDms: 200,
    dailyAiResearch: 100,
  },
  ENTERPRISE: {
    maxVideos: Number.MAX_SAFE_INTEGER,
    dailyReplies: Number.MAX_SAFE_INTEGER,
    dailyDms: Number.MAX_SAFE_INTEGER,
    dailyAiResearch: Number.MAX_SAFE_INTEGER,
  },
};

export type PlanType = keyof typeof PLAN_LIMITS;

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getCurrentUsage(userId: string, plan: PlanType) {
  const today = startOfDay();

  // 回复/私信用量口径：数 Reply/Dm 表中今日实际发送成功（SENT）的记录，
  // 不再数 Activity（批量发送按批次只记 1 条活动，会漏计真实发送量）
  const [videoCount, replyCount, dmCount, aiResearchCount] = await Promise.all([
    prisma.video.count({ where: { userId } }),
    prisma.reply.count({
      where: {
        status: 'SENT',
        sentAt: { gte: today },
        comment: { video: { userId } },
      },
    }),
    prisma.dm.count({
      where: {
        status: 'SENT',
        sentAt: { gte: today },
        comment: { video: { userId } },
      },
    }),
    prisma.aiResearchHistory.count({
      where: {
        userId,
        createdAt: { gte: today },
      },
    }),
  ]);

  const limits = PLAN_LIMITS[plan];

  return {
    videos: { used: videoCount, limit: limits.maxVideos },
    replies: { used: replyCount, limit: limits.dailyReplies },
    dms: { used: dmCount, limit: limits.dailyDms },
    aiResearch: { used: aiResearchCount, limit: limits.dailyAiResearch },
  };
}

export async function checkPlanLimit(
  userId: string,
  plan: PlanType,
  resource: 'videos' | 'replies' | 'dms' | 'aiResearch'
) {
  const usage = await getCurrentUsage(userId, plan);
  const { used, limit } = usage[resource];

  if (used >= limit) {
    return {
      allowed: false,
      message: `当前套餐额度已用完（${used}/${limit}），请升级套餐以继续使用。`,
      usage,
    };
  }

  return { allowed: true, usage };
}
