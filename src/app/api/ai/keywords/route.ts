import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { extractKeywordsWithAI, createDefaultIndexProvider } from '@/lib/ai/keywords';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { tryDecryptAiApiKey } from '@/lib/encryption';
import { getErrorMessage } from '@/lib/errors';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const schema = z.object({
  industry: z.string().min(2, '请输入行业或产品描述').max(500, '描述过长'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const plan = (session.user.plan || 'FREE') as PlanType;
    const limitCheck = await checkPlanLimit(session.user.id, plan, 'aiResearch');
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.message }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiApiKey: true },
    });

    const aiApiKey = tryDecryptAiApiKey(user?.aiApiKey);
    const indexProvider = createDefaultIndexProvider();
    const data = await extractKeywordsWithAI(result.data.industry, aiApiKey, indexProvider);

    const usedRealIndexData = data.scoredKeywords.some(
      (item) => item.source === 'baidu' || item.source === 'douyin' || item.source === 'mixed'
    );

    await prisma.aiResearchHistory.create({
      data: {
        userId: session.user.id,
        title: result.data.industry.trim(),
        industry: result.data.industry.trim(),
        combinedSearchQueries: data.combinedSearchQueries,
        coreKeywords: data.coreKeywords,
        longTailKeywords: data.longTailKeywords,
        painPoints: data.painPoints,
        competitorAccounts: data.competitorAccounts,
        searchCommands: data.searchCommands as unknown as Prisma.InputJsonValue,
        scoredKeywords: data.scoredKeywords as unknown as Prisma.InputJsonValue,
        indexData: (data.indexData ?? []) as unknown as Prisma.InputJsonValue,
        usedRealIndexData,
        researchHotTopics: [],
        researchPainPoints: data.painPoints,
        researchCompetitors: data.competitorAccounts,
        researchKeywords: data.coreKeywords,
      },
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('AI keywords API error:', error);
    const message = getErrorMessage(error) || '关键词提取失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
