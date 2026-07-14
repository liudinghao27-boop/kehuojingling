import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const templateTypeSchema = z.enum(['reply', 'dm']);

const updateSchema = z.object({
  type: templateTypeSchema,
  name: z.string().min(1, '话术名称不能为空'),
  content: z.string().min(1, '话术内容不能为空'),
  isDefault: z.boolean().default(false),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const result = updateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { type, name, content, isDefault } = result.data;

    let existing;
    if (type === 'reply') {
      existing = await prisma.replyTemplate.findFirst({
        where: { id, userId: session.user.id },
      });
    } else {
      existing = await prisma.dmTemplate.findFirst({
        where: { id, userId: session.user.id },
      });
    }

    if (!existing) {
      return NextResponse.json({ error: '话术模板不存在' }, { status: 404 });
    }

    // 如果设为默认，先将该用户同类型其他模板取消默认
    if (isDefault) {
      if (type === 'reply') {
        await prisma.replyTemplate.updateMany({
          where: { userId: session.user.id, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      } else {
        await prisma.dmTemplate.updateMany({
          where: { userId: session.user.id, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
    }

    let template;
    if (type === 'reply') {
      template = await prisma.replyTemplate.update({
        where: { id },
        data: { name, content, isDefault },
      });
    } else {
      template = await prisma.dmTemplate.update({
        where: { id },
        data: { name, content, isDefault },
      });
    }

    return NextResponse.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        content: template.content,
        isDefault: template.isDefault,
        createdAt: template.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Update template error:', error);
    return NextResponse.json({ error: '更新话术模板失败' }, { status: 500 });
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
    const { searchParams } = new URL(req.url);
    const typeResult = templateTypeSchema.safeParse(searchParams.get('type'));

    if (!typeResult.success) {
      return NextResponse.json(
        { error: '类型参数无效，应为 reply 或 dm' },
        { status: 400 }
      );
    }

    const type = typeResult.data;

    let existing;
    if (type === 'reply') {
      existing = await prisma.replyTemplate.findFirst({
        where: { id, userId: session.user.id },
      });
    } else {
      existing = await prisma.dmTemplate.findFirst({
        where: { id, userId: session.user.id },
      });
    }

    if (!existing) {
      return NextResponse.json({ error: '话术模板不存在' }, { status: 404 });
    }

    if (type === 'reply') {
      await prisma.replyTemplate.delete({ where: { id } });
    } else {
      await prisma.dmTemplate.delete({ where: { id } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    return NextResponse.json({ error: '删除话术模板失败' }, { status: 500 });
  }
}
