import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const profileSchema = z.object({
  name: z.string().min(1, '用户名不能为空').max(50, '用户名太长').optional(),
  email: z.string().email('邮箱格式不正确').max(100, '邮箱太长').optional(),
  phone: z.union([z.string().length(0), z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确')]).optional(),
  industryContext: z.string().max(2000, '业务场景描述太长').optional(),
  intentScoreThreshold: z.number().int().min(1, '阈值最小为 1').max(5, '阈值最大为 5').optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = profileSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const data = result.data;
    if (!data.name && !data.email && data.phone === undefined && data.industryContext === undefined && data.intentScoreThreshold === undefined) {
      return NextResponse.json({ error: '没有可更新的内容' }, { status: 400 });
    }

    const updateData: { name?: string; email?: string; phone?: string | null; industryContext?: string | null; intentScoreThreshold?: number } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.industryContext !== undefined) updateData.industryContext = data.industryContext || null;
    if (data.intentScoreThreshold !== undefined) updateData.intentScoreThreshold = data.intentScoreThreshold;

    if (updateData.email) {
      const existing = await prisma.user.findUnique({
        where: { email: updateData.email },
      });
      if (existing && existing.id !== session.user.id) {
        return NextResponse.json({ error: '该邮箱已被使用' }, { status: 409 });
      }
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        plan: true,
        industryContext: true,
        intentScoreThreshold: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: '个人信息已更新',
      user,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: '更新个人信息失败' }, { status: 500 });
  }
}
