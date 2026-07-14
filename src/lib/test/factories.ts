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
  }> = {}
) {
  return prisma.video.create({
    data: {
      url: overrides.url ?? 'https://douyin.com/video/test',
      platform: overrides.platform ?? 'DOUYIN',
      title: overrides.title ?? 'Test Video',
      author: overrides.author ?? 'Test Author',
      userId,
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
      status: overrides.status ?? 'NEW',
      isNoise: overrides.isNoise ?? false,
    },
  });
}
