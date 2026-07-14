import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateHistorySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  tags: z.array(z.string().max(20)).max(10).optional(),
  isFavorite: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const item = await prisma.aiResearchHistory.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!item) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Get AI research history error:', error);
    return NextResponse.json({ error: '获取历史记录失败' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.aiResearchHistory.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    const body = await req.json();
    const result = updateHistorySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const item = await prisma.aiResearchHistory.update({
      where: { id },
      data: {
        ...result.data,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Update AI research history error:', error);
    return NextResponse.json({ error: '更新历史记录失败' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.aiResearchHistory.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    await prisma.aiResearchHistory.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete AI research history error:', error);
    return NextResponse.json({ error: '删除历史记录失败' }, { status: 500 });
  }
}
