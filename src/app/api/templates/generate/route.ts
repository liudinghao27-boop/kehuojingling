import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { generateTemplates } from '@/lib/ai/templates';
import { tryDecryptAiApiKey } from '@/lib/encryption';
import { z } from 'zod';

const schema = z.object({
  type: z.enum(['reply', 'dm']),
  prompt: z.string().optional(),
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

    const { type, prompt } = result.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiApiKey: true, industryContext: true },
    });

    const industryContext = prompt?.trim() || user?.industryContext || '通用获客场景';
    const aiApiKey = tryDecryptAiApiKey(user?.aiApiKey);

    const templates = await generateTemplates(
      type,
      industryContext,
      aiApiKey
    );

    return NextResponse.json({
      success: true,
      templates,
      usedContext: industryContext,
    });
  } catch (error) {
    console.error('Generate templates error:', error);
    return NextResponse.json({ error: '生成话术失败' }, { status: 500 });
  }
}
