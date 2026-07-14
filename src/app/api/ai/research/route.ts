import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { researchWebPage } from '@/lib/ai/research';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { tryDecryptAiApiKey } from '@/lib/encryption';
import { getErrorMessage } from '@/lib/errors';
import { z } from 'zod';

const schema = z.object({
  url: z.string().url('请输入有效的网页链接'),
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
    const data = await researchWebPage(result.data.url, aiApiKey);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('AI research API error:', error);
    const message = getErrorMessage(error) || '网页研究失败';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
