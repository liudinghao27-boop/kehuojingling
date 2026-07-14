import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { encryptAiApiKey, tryDecryptAiApiKey } from '@/lib/encryption';
import { z } from 'zod';

function maskKey(key: string) {
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiApiKey: true },
    });

    const plainKey = tryDecryptAiApiKey(user?.aiApiKey);

    return NextResponse.json({
      hasKey: !!plainKey,
      maskedKey: plainKey ? maskKey(plainKey) : null,
    });
  } catch (error) {
    console.error('Get AI key error:', error);
    return NextResponse.json({ error: '获取 AI Key 失败' }, { status: 500 });
  }
}

const saveKeySchema = z.object({
  aiApiKey: z.string().min(10, 'API Key 太短').max(200, 'API Key 太长'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = saveKeySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const encryptedKey = encryptAiApiKey(result.data.aiApiKey);

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { aiApiKey: encryptedKey },
      select: { aiApiKey: true },
    });

    const plainKey = tryDecryptAiApiKey(user.aiApiKey);

    return NextResponse.json({
      success: true,
      message: 'AI Key 已保存',
      maskedKey: plainKey ? maskKey(plainKey) : null,
    });
  } catch (error) {
    console.error('Save AI key error:', error);
    return NextResponse.json({ error: '保存 AI Key 失败' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { aiApiKey: null },
    });

    return NextResponse.json({ success: true, message: 'AI Key 已删除' });
  } catch (error) {
    console.error('Delete AI key error:', error);
    return NextResponse.json({ error: '删除 AI Key 失败' }, { status: 500 });
  }
}
