import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const schema = z.object({
  type: z.enum(['reply', 'dm']),
  templates: z.array(
    z.object({
      name: z.string().min(1, '话术名称不能为空'),
      content: z.string().min(1, '话术内容不能为空'),
    })
  ).min(1, '至少选择一条话术'),
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

    const { type, templates } = result.data;
    const userId = session.user.id;

    const createOperations = templates.map((t) =>
      type === 'reply'
        ? prisma.replyTemplate.create({
            data: { name: t.name, content: t.content, isDefault: false, userId },
          })
        : prisma.dmTemplate.create({
            data: { name: t.name, content: t.content, isDefault: false, userId },
          })
    );

    const created = await prisma.$transaction(createOperations);

    return NextResponse.json({
      success: true,
      templates: created.map((t) => ({
        id: t.id,
        name: t.name,
        content: t.content,
        isDefault: t.isDefault,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Bulk create templates error:', error);
    return NextResponse.json({ error: '批量保存话术失败' }, { status: 500 });
  }
}
