import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { parseVideoUrl, scrapeCommentsReal } from '@/lib/scraper/douyin';
import { analyzeComments } from '@/lib/ai/noise';
import { tryDecryptAiApiKey } from '@/lib/encryption';
import { checkPlanLimit, PlanType } from '@/lib/plans';

const scrapeSchema = z.object({
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
    const result = scrapeSchema.safeParse(body);

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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiApiKey: true, industryContext: true, intentScoreThreshold: true, noiseRules: true },
    });

    const aiApiKey = tryDecryptAiApiKey(user?.aiApiKey);
    const threshold = user?.intentScoreThreshold ?? 4;
    const noiseRules = user?.noiseRules as import('@/lib/ai/noise').NoiseRules | undefined;

    // 解析视频链接
    const parsedVideo = parseVideoUrl(url);
    if (!parsedVideo) {
      return NextResponse.json(
        { error: '无法解析视频链接，请检查链接格式' },
        { status: 400 }
      );
    }

    // 按 (userId, url) 去重，同一视频不允许重复添加
    const existingVideo = await prisma.video.findFirst({
      where: { userId: session.user.id, url: parsedVideo.originalUrl },
      select: { id: true },
    });
    if (existingVideo) {
      return NextResponse.json({ error: '该视频已添加' }, { status: 409 });
    }

    // 抓取评论（接入 Evil0ctal 开源爬虫）
    const scrapedComments = await scrapeCommentsReal(parsedVideo);

    // 创建视频记录
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

    // AI 分析评论意向并过滤白噪音
    const contents = scrapedComments.map(c => c.content);
    const analyses = await analyzeComments(contents, user?.industryContext || undefined, aiApiKey, noiseRules);

    const savedComments = [];
    for (let i = 0; i < scrapedComments.length; i++) {
      const comment = scrapedComments[i];
      const analysis = analyses[i];

      if (analysis.isNoise || analysis.score < threshold) {
        continue;
      }

      const saved = await prisma.comment.create({
        data: {
          content: comment.content,
          authorName: comment.authorName,
          authorAvatar: comment.authorAvatar,
          videoId: video.id,
          intentScore: analysis.score,
          intentKeywords: analysis.keywords,
          status: analysis.score >= threshold ? 'ANALYZED' : 'NEW',
        },
      });

      savedComments.push({
        id: saved.id,
        content: saved.content,
        authorName: saved.authorName,
        intentScore: saved.intentScore,
        keywords: saved.intentKeywords,
        category: analysis.category,
      });
    }

    return NextResponse.json({
      success: true,
      video: {
        id: video.id,
        url: video.url,
        platform: video.platform,
        commentsCount: savedComments.length,
        highIntentCount: savedComments.filter(c => c.intentScore >= threshold).length,
      },
      comments: savedComments,
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json(
      { error: '抓取失败，请稍后重试' },
      { status: 500 }
    );
  }
}

// 获取视频评论列表
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');

    if (!videoId) {
      return NextResponse.json({ error: '缺少视频ID' }, { status: 400 });
    }

    // 归属校验：只能读取自己视频下的评论
    const ownedVideo = await prisma.video.findFirst({
      where: { id: videoId, userId: session.user.id },
      select: { id: true },
    });
    if (!ownedVideo) {
      return NextResponse.json({ error: '视频不存在' }, { status: 404 });
    }

    const comments = await prisma.comment.findMany({
      where: { videoId },
      orderBy: { intentScore: 'desc' },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    return NextResponse.json(
      { error: '获取评论失败' },
      { status: 500 }
    );
  }
}
