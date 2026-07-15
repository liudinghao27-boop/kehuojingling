import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { Prisma, CommentStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');
    const intent = searchParams.get('intent'); // 'high' for intentScore >= threshold
    const status = searchParams.get('status');
    const noise = searchParams.get('noise'); // 'true' | 'false' | 'all', default 'false'
    const keyword = searchParams.get('keyword')?.trim();
    const q = searchParams.get('q')?.trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { intentScoreThreshold: true },
    });
    const threshold = user?.intentScoreThreshold ?? 4;

    const where: Prisma.CommentWhereInput = {
      video: { userId: session.user.id },
    };

    if (videoId) {
      where.videoId = videoId;
    }

    if (status) {
      if (status === 'SENT') {
        where.status = { in: ['REPLIED', 'DM_SENT', 'CONVERTED'] };
      } else {
        where.status = status as CommentStatus;
      }
    }

    if (intent === 'high') {
      where.intentScore = { gte: threshold };
    }

    if (noise === 'true') {
      where.isNoise = true;
    } else if (noise === 'false') {
      where.isNoise = false;
    }
    // noise === 'all' 或 undefined 时不按 isNoise 过滤；undefined 时默认显示非噪音
    if (!noise) {
      where.isNoise = false;
    }

    if (q) {
      where.OR = [
        { content: { contains: q } },
        { authorName: { contains: q } },
      ];
    }

    if (keyword) {
      where.matchedKeywords = { has: keyword };
    }

    // 不使用事务：count 和 findMany 允许轻微不一致，避免连接池紧张时 transaction timeout
    const [total, comments] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        include: {
          video: {
            select: {
              id: true,
              title: true,
            },
          },
          replies: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, content: true, sentAt: true, createdAt: true, status: true },
          },
          dms: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, content: true, sentAt: true, createdAt: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      comments: comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        authorName: comment.authorName,
        authorAvatar: comment.authorAvatar,
        intentScore: comment.intentScore,
        intentKeywords: comment.intentKeywords,
        matchedKeywords: comment.matchedKeywords,
        isNoise: comment.isNoise,
        noiseType: comment.noiseType,
        noiseReason: comment.noiseReason,
        status: comment.status,
        videoId: comment.videoId,
        videoTitle: comment.video.title || `视频 ${comment.video.id.slice(-6)}`,
        replyCount: comment.replies.length,
        dmCount: comment.dms.length,
        replies: comment.replies.map((r) => ({
          id: r.id,
          content: r.content,
          sentAt: r.sentAt?.toISOString() || r.createdAt.toISOString(),
          status: r.status,
        })),
        dms: comment.dms.map((d) => ({
          id: d.id,
          content: d.content,
          sentAt: d.sentAt?.toISOString() || d.createdAt.toISOString(),
          status: d.status,
        })),
        createdAt: comment.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('List comments error:', error);
    return NextResponse.json({ error: '获取评论列表失败' }, { status: 500 });
  }
}
