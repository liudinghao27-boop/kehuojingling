import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { parseVideoUrl } from '@/lib/scraper/douyin';
import { scrapeAndSaveComments } from '@/lib/scraper';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { z } from 'zod';

const createSchema = z.object({
  url: z.string().min(1, '请输入视频链接'),
  platform: z.enum(['DOUYIN', 'KUAISHOU', 'SHIPINHAO']).default('DOUYIN'),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const videos = await prisma.video.findMany({
      where: { userId: session.user.id },
      include: {
        _count: {
          select: { comments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const highIntentMap = new Map<string, number>();
    const highIntentGroups = await prisma.comment.groupBy({
      by: ['videoId'],
      where: {
        video: { userId: session.user.id },
        intentScore: { gte: 4 },
      },
      _count: { id: true },
    });
    for (const group of highIntentGroups) {
      highIntentMap.set(group.videoId, group._count.id);
    }

    const videosWithStats = videos.map((video) => ({
      id: video.id,
      url: video.url,
      platform: video.platform,
      title: video.title || `视频 ${video.id.slice(-6)}`,
      author: video.author || '未知作者',
      status: video.status,
      comments: video._count.comments,
      highIntent: highIntentMap.get(video.id) || 0,
      lastScrapedAt: video.lastScrapedAt?.toISOString() || null,
      createdAt: video.createdAt.toISOString(),
    }));

    return NextResponse.json({ videos: videosWithStats });
  } catch (error) {
    console.error('List videos error:', error);
    return NextResponse.json({ error: '获取视频列表失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = createSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { url, platform } = result.data;

    const plan = (session.user.plan || 'FREE') as PlanType;
    const limitCheck = await checkPlanLimit(session.user.id, plan, 'videos');
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.message }, { status: 403 });
    }

    const parsedVideo = parseVideoUrl(url);
    if (!parsedVideo) {
      return NextResponse.json(
        { error: '无法解析视频链接，请检查链接格式' },
        { status: 400 }
      );
    }

    const video = await prisma.video.create({
      data: {
        url: parsedVideo.originalUrl,
        platform,
        title: `视频 ${parsedVideo.videoId}`,
        author: parsedVideo.platform,
        status: 'MONITORING',
        userId: session.user.id,
      },
    });

    // 同步抓取评论并保存（MVP 阶段先不用队列，避免 dev 模式下队列不执行）
    let commentsCount = 0;
    try {
      const result = await scrapeAndSaveComments(video.id, parsedVideo.originalUrl);
      commentsCount = result.commentsCount;
    } catch (error) {
      console.error('Scrape comments error:', error);
      // 抓取失败不影响视频创建，返回时 commentsCount 为 0
    }

    return NextResponse.json({
      success: true,
      video: {
        id: video.id,
        url: video.url,
        platform: video.platform,
        title: video.title,
        author: video.author,
        status: video.status,
        comments: commentsCount,
        highIntent: 0,
        createdAt: video.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create video error:', error);
    return NextResponse.json({ error: '添加视频失败' }, { status: 500 });
  }
}
