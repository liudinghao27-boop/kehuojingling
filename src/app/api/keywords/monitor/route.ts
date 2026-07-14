import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const batchSchema = z.object({
  keywords: z.array(z.string().min(1).max(100)).max(100),
  source: z.string().optional(),
});

const deleteSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const items = await prisma.keywordMonitor.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        keyword: true,
        source: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Fetch keyword monitors error:', error);
    return NextResponse.json({ error: '获取监控词库失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = batchSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { keywords, source } = result.data;
    const normalized = Array.from(new Set(keywords.map((k) => k.trim()).filter(Boolean)));

    await prisma.$transaction(
      normalized.map((keyword) =>
        prisma.keywordMonitor.upsert({
          where: { userId_keyword: { userId: session.user.id, keyword } },
          update: { source: source ?? null, updatedAt: new Date() },
          create: { userId: session.user.id, keyword, source: source ?? null },
        })
      )
    );

    return NextResponse.json({ success: true, count: normalized.length });
  } catch (error) {
    console.error('Save keyword monitors error:', error);
    return NextResponse.json({ error: '保存监控词库失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = deleteSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    await prisma.keywordMonitor.deleteMany({
      where: {
        userId: session.user.id,
        keyword: { in: result.data.keywords },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete keyword monitors error:', error);
    return NextResponse.json({ error: '删除监控词库失败' }, { status: 500 });
  }
}
