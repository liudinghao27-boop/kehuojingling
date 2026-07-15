import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { parseVideoUrl } from '@/lib/scraper/douyin';
import { scrapeAndSaveComments } from '@/lib/scraper';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { z } from 'zod';

const createSchema = z.object({
  keywordMonitorId: z.string().min(1, '请选择监控关键词'),
  url: z.string().min(1, '请输入视频链接'),
  platform: z.enum(['DOUYIN', 'KUAISHOU', 'SHIPINHAO']).default('DOUYIN'),
});

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

    const { keywordMonitorId, url, platform } = result.data;

    const keywordMonitor = await prisma.keywordMonitor.findFirst({
      where: { id: keywordMonitorId, userId: session.user.id },
    });

    if (!keywordMonitor) {
      return NextResponse.json(
        { error: '监控关键词不存在或无权访问' },
        { status: 403 }
      );
    }

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
        keywordMonitorId: keywordMonitor.id,
      },
      include: {
        keywordMonitor: {
          select: { id: true, keyword: true },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    let commentsCount = 0;
    try {
      const scrapeResult = await scrapeAndSaveComments(video.id, parsedVideo.originalUrl);
      commentsCount = scrapeResult.commentsCount;
    } catch (error) {
      console.error('Scrape comments error:', error);
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
        keywordMonitor: video.keywordMonitor,
        createdAt: video.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create video from keyword error:', error);
    return NextResponse.json({ error: '添加视频失败' }, { status: 500 });
  }
}
