import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const bulkStatusSchema = z.object({
  action: z.enum(['pause', 'resume']),
});

/**
 * 批量暂停 / 恢复当前用户的发送账号。
 * pause：所有 ACTIVE → DISABLED；resume：所有 DISABLED → ACTIVE。
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = bulkStatusSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { action } = result.data;
    const updated = await prisma.senderAccount.updateMany({
      where: {
        userId: session.user.id,
        status: action === 'pause' ? 'ACTIVE' : 'DISABLED',
      },
      data: {
        status: action === 'pause' ? 'DISABLED' : 'ACTIVE',
      },
    });

    return NextResponse.json({ updated: updated.count });
  } catch (error) {
    console.error('Bulk update sender accounts status error:', error);
    return NextResponse.json({ error: '批量更新账号状态失败' }, { status: 500 });
  }
}
