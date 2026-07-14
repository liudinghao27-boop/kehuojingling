import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { analyzeIntentWithAI, generateReplySuggestion } from '@/lib/ai/intent';
import { analyzeComments } from '@/lib/ai/noise';
import { tryDecryptAiApiKey } from '@/lib/encryption';

// POST: 分析单条评论意向
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { commentId, content } = body;

    if (!content) {
      return NextResponse.json({ error: '缺少评论内容' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiApiKey: true, industryContext: true, intentScoreThreshold: true },
    });

    const aiApiKey = tryDecryptAiApiKey(user?.aiApiKey);
    const threshold = user?.intentScoreThreshold ?? 4;

    // AI 分析意向
    const intent = await analyzeIntentWithAI(
      content,
      user?.industryContext || undefined,
      aiApiKey
    );

    // 如果有 commentId，更新数据库
    if (commentId) {
      await prisma.comment.update({
        where: { id: commentId },
        data: {
          intentScore: intent.score,
          intentKeywords: intent.keywords,
          status: intent.score >= threshold ? 'ANALYZED' : 'NEW',
        },
      });
    }

    // 生成回复建议
    const replySuggestion = await generateReplySuggestion(
      content,
      intent,
      undefined,
      aiApiKey
    );

    return NextResponse.json({
      success: true,
      analysis: intent,
      replySuggestion,
    });
  } catch (error) {
    console.error('AI analyze error:', error);
    return NextResponse.json(
      { error: '分析失败，请稍后重试' },
      { status: 500 }
    );
  }
}

// GET: 批量分析视频下的所有评论
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiApiKey: true, industryContext: true, intentScoreThreshold: true, noiseRules: true },
    });

    const aiApiKey = tryDecryptAiApiKey(user?.aiApiKey);
    const threshold = user?.intentScoreThreshold ?? 4;
    const noiseRules = user?.noiseRules as import('@/lib/ai/noise').NoiseRules | undefined;

    // 获取未分析的评论
    const comments = await prisma.comment.findMany({
      where: {
        videoId,
        status: 'NEW',
      },
      take: 20, // 每次最多分析20条
    });

    const contents = comments.map(c => c.content);
    const analyses = await analyzeComments(
      contents,
      user?.industryContext || undefined,
      aiApiKey,
      noiseRules
    );

    const results = [];
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      const analysis = analyses[i];

      await prisma.comment.update({
        where: { id: comment.id },
        data: {
          intentScore: analysis.score,
          intentKeywords: analysis.keywords,
          status: analysis.score >= threshold ? 'ANALYZED' : 'NEW',
        },
      });

      results.push({
        id: comment.id,
        content: comment.content,
        analysis,
      });
    }

    return NextResponse.json({
      success: true,
      analyzed: results.length,
      results,
    });
  } catch (error) {
    console.error('Batch AI analyze error:', error);
    return NextResponse.json(
      { error: '批量分析失败' },
      { status: 500 }
    );
  }
}
