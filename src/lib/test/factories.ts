import bcrypt from 'bcryptjs';
import { prisma } from './setup';

export async function createUser(
  overrides: Partial<{
    email: string;
    name: string;
    password: string;
    intentScoreThreshold: number;
  }> = {}
) {
  const password = overrides.password ?? 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      name: overrides.name ?? 'Test User',
      password: hashedPassword,
      intentScoreThreshold: overrides.intentScoreThreshold ?? 4,
    },
  });
}

export async function createVideo(
  userId: string,
  overrides: Partial<{
    url: string;
    platform: 'DOUYIN' | 'KUAISHOU' | 'SHIPINHAO';
    title: string;
    author: string;
    keywordMonitorId: string | null;
  }> = {}
) {
  return prisma.video.create({
    data: {
      url: overrides.url ?? 'https://douyin.com/video/test',
      platform: overrides.platform ?? 'DOUYIN',
      title: overrides.title ?? 'Test Video',
      author: overrides.author ?? 'Test Author',
      userId,
      keywordMonitorId: overrides.keywordMonitorId ?? null,
    },
  });
}

export async function createComment(
  videoId: string,
  overrides: Partial<{
    content: string;
    authorName: string;
    authorAvatar: string;
    intentScore: number;
    intentKeywords: string[];
    matchedKeywords: string[];
    status: 'NEW' | 'ANALYZED' | 'REPLIED' | 'DM_SENT' | 'CONVERTED';
    isNoise: boolean;
  }> = {}
) {
  return prisma.comment.create({
    data: {
      content: overrides.content ?? 'Test comment',
      authorName: overrides.authorName ?? 'Test Author',
      authorAvatar: overrides.authorAvatar,
      videoId,
      intentScore: overrides.intentScore ?? 0,
      intentKeywords: overrides.intentKeywords,
      matchedKeywords: overrides.matchedKeywords ?? [],
      status: overrides.status ?? 'NEW',
      isNoise: overrides.isNoise ?? false,
    },
  });
}

export async function createKeywordMonitor(
  userId: string,
  overrides: Partial<{
    keyword: string;
    source: string;
  }> = {}
) {
  return prisma.keywordMonitor.create({
    data: {
      userId,
      keyword: overrides.keyword ?? 'Test Keyword',
      source: overrides.source,
    },
  });
}

export async function createSenderAccount(
  userId: string,
  overrides: Partial<{
    platform: 'DOUYIN' | 'KUAISHOU' | 'SHIPINHAO';
    label: string;
    cookies: string;
    proxyUrl: string | null;
    status: 'ACTIVE' | 'COOLING' | 'DISABLED' | 'EXPIRED';
    healthScore: number;
    failCount: number;
    dailySent: number;
    dailyLimit: number;
    lastFailAt: Date | null;
    lastSuccessAt: Date | null;
  }> = {}
) {
  return prisma.senderAccount.create({
    data: {
      userId,
      platform: overrides.platform ?? 'DOUYIN',
      label: overrides.label ?? 'Test Account',
      cookies: overrides.cookies ?? 'sessionid=test-cookie',
      proxyUrl: overrides.proxyUrl ?? null,
      status: overrides.status ?? 'ACTIVE',
      healthScore: overrides.healthScore ?? 100,
      failCount: overrides.failCount ?? 0,
      dailySent: overrides.dailySent ?? 0,
      dailyLimit: overrides.dailyLimit ?? 50,
      lastFailAt: overrides.lastFailAt ?? null,
      lastSuccessAt: overrides.lastSuccessAt ?? null,
    },
  });
}
