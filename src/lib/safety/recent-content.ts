/**
 * 查询用户近期已发出（或排队中）的回复/私信内容，用于发出端语义查重。
 */

import { prisma } from '@/lib/db';

const MAX_HISTORY = 200;

/**
 * 拉取最近 days 天内该用户发出过的话术内容（Reply + Dm，排除 FAILED）。
 */
export async function getRecentOutgoingContents(
  userId: string,
  days: number = 30
): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [replies, dms] = await Promise.all([
    prisma.reply.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ['SENT', 'PENDING'] },
        comment: { video: { userId } },
      },
      select: { content: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY,
    }),
    prisma.dm.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ['SENT', 'PENDING'] },
        comment: { video: { userId } },
      },
      select: { content: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY,
    }),
  ]);

  return [...replies.map((r) => r.content), ...dms.map((d) => d.content)];
}
