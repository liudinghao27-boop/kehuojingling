import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const rangeSchema = z.enum(['7d', '30d', '90d']).default('7d');

function getStartDate(range: '7d' | '30d' | '90d') {
  const now = new Date();
  switch (range) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

function formatDate(date: Date, range: '7d' | '30d' | '90d') {
  if (range === '7d') {
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  if (range === '30d') {
    const week = Math.ceil(date.getDate() / 7);
    return `第${week}周`;
  }
  return `${date.getMonth() + 1}月`;
}

function groupByDate<T extends { createdAt: Date }>(
  items: T[],
  range: '7d' | '30d' | '90d'
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    let key: string;
    if (range === '7d') {
      key = formatDate(new Date(item.createdAt), '7d');
    } else if (range === '30d') {
      const date = new Date(item.createdAt);
      const week = Math.ceil(date.getDate() / 7);
      key = `${date.getFullYear()}-${date.getMonth() + 1}-第${week}周`;
    } else {
      key = `${new Date(item.createdAt).getFullYear()}-${new Date(item.createdAt).getMonth() + 1}`;
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rangeResult = rangeSchema.safeParse(searchParams.get('range'));
    const range = rangeResult.success ? rangeResult.data : '7d';
    const startDate = getStartDate(range);
    const userId = session.user.id;

    const [comments, highIntentComments, replies, dms, convertedComments] = await Promise.all([
      prisma.comment.findMany({
        where: { video: { userId }, createdAt: { gte: startDate } },
        include: { video: { select: { title: true } } },
      }),
      prisma.comment.findMany({
        where: { video: { userId }, intentScore: { gte: 4 }, createdAt: { gte: startDate } },
      }),
      prisma.reply.findMany({
        where: { comment: { video: { userId } }, createdAt: { gte: startDate } },
      }),
      prisma.dm.findMany({
        where: { comment: { video: { userId } }, createdAt: { gte: startDate } },
      }),
      prisma.comment.findMany({
        where: { video: { userId }, status: 'CONVERTED', createdAt: { gte: startDate } },
      }),
    ]);

    // Trend
    const commentGroups = groupByDate(comments, range);
    const highIntentGroups = groupByDate(highIntentComments, range);
    const convertedGroups = groupByDate(convertedComments, range);

    const allKeys = new Set([
      ...Object.keys(commentGroups),
      ...Object.keys(highIntentGroups),
      ...Object.keys(convertedGroups),
    ]);

    const trend = Array.from(allKeys)
      .sort()
      .map((key) => {
        const displayKey = range === '7d' ? key : key.split('-').slice(-1)[0];
        return {
          date: displayKey,
          comments: commentGroups[key]?.length || 0,
          highIntent: highIntentGroups[key]?.length || 0,
          converted: convertedGroups[key]?.length || 0,
        };
      });

    // Top videos
    const videoStats: Record<string, { title: string; comments: number; highIntent: number; converted: number }> = {};
    for (const comment of comments) {
      const videoId = comment.videoId;
      const title = comment.video.title || `视频 ${videoId.slice(-6)}`;
      if (!videoStats[videoId]) {
        videoStats[videoId] = { title, comments: 0, highIntent: 0, converted: 0 };
      }
      videoStats[videoId].comments += 1;
      if (comment.intentScore >= 4) videoStats[videoId].highIntent += 1;
      if (comment.status === 'CONVERTED') videoStats[videoId].converted += 1;
    }

    const topVideos = Object.values(videoStats)
      .sort((a, b) => b.comments - a.comments)
      .slice(0, 5);

    // Top keywords
    const keywordCounts: Record<string, number> = {};
    for (const comment of highIntentComments) {
      for (const keyword of comment.intentKeywords) {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      }
    }

    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({ word, count }));

    const totalComments = comments.length;
    const converted = convertedComments.length;
    const conversionRate = totalComments > 0 ? `${((converted / totalComments) * 100).toFixed(1)}%` : '0%';

    return NextResponse.json({
      totalComments,
      highIntent: highIntentComments.length,
      replies: replies.length,
      dms: dms.length,
      converted,
      conversionRate,
      trend,
      topVideos,
      topKeywords,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: '获取分析数据失败' }, { status: 500 });
  }
}
