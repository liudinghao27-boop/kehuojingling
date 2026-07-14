import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const templateTypeSchema = z.enum(['reply', 'dm']);

const createSchema = z.object({
  type: templateTypeSchema,
  name: z.string().min(1, '话术名称不能为空'),
  content: z.string().min(1, '话术内容不能为空'),
  isDefault: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const typeResult = templateTypeSchema.safeParse(searchParams.get('type'));
    if (!typeResult.success) {
      return NextResponse.json(
        { error: '类型参数无效，应为 reply 或 dm' },
        { status: 400 }
      );
    }

    const type = typeResult.data;

    let templates;
    if (type === 'reply') {
      templates = await prisma.replyTemplate.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      templates = await prisma.dmTemplate.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
      });
    }

    return NextResponse.json({
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        content: template.content,
        isDefault: template.isDefault,
        createdAt: template.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List templates error:', error);
    return NextResponse.json({ error: '获取话术模板失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = createSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { type, name, content, isDefault } = result.data;

    // 如果设为默认，先将该用户同类型其他模板取消默认
    if (isDefault) {
      if (type === 'reply') {
        await prisma.replyTemplate.updateMany({
          where: { userId: session.user.id, isDefault: true },
          data: { isDefault: false },
        });
      } else {
        await prisma.dmTemplate.updateMany({
          where: { userId: session.user.id, isDefault: true },
          data: { isDefault: false },
        });
      }
    }

    let template;
    if (type === 'reply') {
      template = await prisma.replyTemplate.create({
        data: { name, content, isDefault, userId: session.user.id },
      });
    } else {
      template = await prisma.dmTemplate.create({
        data: { name, content, isDefault, userId: session.user.id },
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
    console.error('Create template error:', error);
    return NextResponse.json({ error: '创建话术模板失败' }, { status: 500 });
  }
}
