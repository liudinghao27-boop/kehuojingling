import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { parseVideoUrl, scrapeComments } from '@/lib/scraper/douyin';
import { analyzeIntentWithAI } from '@/lib/ai/intent';

const scrapeSchema = z.object({
  url: z.string().url('请输入有效的视频链接'),
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

    // 解析视频链接
    const parsedVideo = parseVideoUrl(url);
    if (!parsedVideo) {
      return NextResponse.json(
        { error: '无法解析视频链接，请检查链接格式' },
        { status: 400 }
      );
    }

    // 抓取评论（接入开源爬虫）
    const scrapedComments = await scrapeComments(parsedVideo, { maxComments: 50 });

    // 创建视频记录
    const video = await prisma.video.create({
      data: {
        url,
        platform,
        title: `视频 ${parsedVideo.videoId}`,
        author: parsedVideo.platform,
        status: 'MONITORING',
        userId: session.user.id,
      },
    });

    // AI 分析评论意向并保存
    const savedComments = [];
    for (const comment of scrapedComments) {
      // 调用 AI 意向识别
      const intent = await analyzeIntentWithAI(comment.content);
      
      const saved = await prisma.comment.create({
        data: {
          content: comment.content,
          authorName: comment.authorName,
          authorAvatar: comment.authorAvatar,
          videoId: video.id,
          intentScore: intent.score,
          intentKeywords: intent.keywords,
          status: intent.score >= 4 ? 'ANALYZED' : 'NEW',
        },
      });
      
      savedComments.push({
        id: saved.id,
        content: saved.content,
        authorName: saved.authorName,
        intentScore: intent.score,
        keywords: intent.keywords,
        category: intent.category,
      });
    }

    return NextResponse.json({
      success: true,
      video: {
        id: video.id,
        url: video.url,
        platform: video.platform,
        commentsCount: savedComments.length,
        highIntentCount: savedComments.filter(c => c.intentScore >= 4).length,
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
