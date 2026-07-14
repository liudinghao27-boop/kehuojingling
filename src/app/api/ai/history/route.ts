import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const scoredKeywordSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().int().min(1).max(5),
  competition: z.number().int().min(1).max(5),
  businessIntent: z.number().int().min(1).max(5),
  score: z.number().int().min(1).max(5),
});

const saveHistorySchema = z.object({
  title: z.string().optional(),
  industry: z.string().optional(),
  url: z.string().optional(),
  combinedSearchQueries: z.array(z.string()).default([]),
  coreKeywords: z.array(z.string()).default([]),
  longTailKeywords: z.array(z.string()).default([]),
  painPoints: z.array(z.string()).default([]),
  competitorAccounts: z.array(z.string()).default([]),
  searchCommands: z.record(z.string(), z.array(z.string())).default({}),
  scoredKeywords: z.array(scoredKeywordSchema).default([]),
  researchSummary: z.string().optional(),
  researchHotTopics: z.array(z.string()).default([]),
  researchPainPoints: z.array(z.string()).default([]),
  researchCompetitors: z.array(z.string()).default([]),
  researchKeywords: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  isFavorite: z.boolean().default(false),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const items = await prisma.aiResearchHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        industry: true,
        url: true,
        tags: true,
        isFavorite: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Fetch AI research history error:', error);
    return NextResponse.json({ error: '获取历史记录失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = saveHistorySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const data = result.data;
    const title = data.title?.trim() || data.industry?.trim() || data.url?.trim() || '未命名研究';

    const item = await prisma.aiResearchHistory.create({
      data: {
        userId: session.user.id,
        title,
        industry: data.industry,
        url: data.url,
        combinedSearchQueries: data.combinedSearchQueries,
        coreKeywords: data.coreKeywords,
        longTailKeywords: data.longTailKeywords,
        painPoints: data.painPoints,
        competitorAccounts: data.competitorAccounts,
        searchCommands: data.searchCommands,
        scoredKeywords: data.scoredKeywords,
        researchSummary: data.researchSummary,
        researchHotTopics: data.researchHotTopics,
        researchPainPoints: data.researchPainPoints,
        researchCompetitors: data.researchCompetitors,
        researchKeywords: data.researchKeywords,
        tags: data.tags,
        isFavorite: data.isFavorite,
      },
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Save AI research history error:', error);
    return NextResponse.json({ error: '保存历史记录失败' }, { status: 500 });
  }
}
