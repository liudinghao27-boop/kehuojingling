import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';
import {
  updateAccount,
  deleteAccount,
  recoverAccount,
} from '@/lib/sender/account-pool';
import { prisma } from '@/lib/db';

const updateAccountSchema = z.object({
  label: z.string().min(1).optional(),
  cookies: z.string().min(1).optional(),
  proxyUrl: z.string().optional().nullable(),
  dailyLimit: z.number().int().min(1).max(500).optional(),
  status: z.enum(['ACTIVE', 'COOLING', 'DISABLED', 'EXPIRED']).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const account = await prisma.senderAccount.findUnique({
      where: { id },
    });

    if (!account || account.userId !== session.user.id) {
      return NextResponse.json({ error: '账号不存在' }, { status: 404 });
    }

    return NextResponse.json({
      account: {
        id: account.id,
        platform: account.platform,
        label: account.label,
        proxyUrl: account.proxyUrl,
        status: account.status,
        healthScore: account.healthScore,
        failCount: account.failCount,
        dailySent: account.dailySent,
        dailyLimit: account.dailyLimit,
        lastFailAt: account.lastFailAt?.toISOString() ?? null,
        lastSuccessAt: account.lastSuccessAt?.toISOString() ?? null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Get sender account error:', error);
    return NextResponse.json(
      { error: '获取账号详情失败' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    // 验证账号归属
    const existing = await prisma.senderAccount.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: '账号不存在' }, { status: 404 });
    }

    const body = await req.json();
    const result = updateAccountSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    // 如果状态改为 ACTIVE，使用 recoverAccount 重置健康度
    if (result.data.status === 'ACTIVE' && existing.status === 'COOLING') {
      const account = await recoverAccount(id);
      return NextResponse.json({
        account: {
          id: account.id,
          status: account.status,
          healthScore: account.healthScore,
        },
      });
    }

    const account = await updateAccount(id, result.data);

    return NextResponse.json({
      account: {
        id: account.id,
        platform: account.platform,
        label: account.label,
        status: account.status,
        healthScore: account.healthScore,
        dailyLimit: account.dailyLimit,
        updatedAt: account.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Update sender account error:', error);
    return NextResponse.json({ error: '更新账号失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    // 验证账号归属
    const existing = await prisma.senderAccount.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: '账号不存在' }, { status: 404 });
    }

    await deleteAccount(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete sender account error:', error);
    return NextResponse.json({ error: '删除账号失败' }, { status: 500 });
  }
}
