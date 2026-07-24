import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';
import {
  createAccount,
  listAccounts,
} from '@/lib/sender/account-pool';
import { Platform } from '@prisma/client';

const platformSchema = z.enum(['DOUYIN', 'KUAISHOU', 'SHIPINHAO']);

const createAccountSchema = z.object({
  platform: platformSchema.default('DOUYIN'),
  label: z.string().min(1, '账号备注不能为空'),
  cookies: z.string().min(1, 'Cookie 不能为空'),
  proxyUrl: z.string().optional(),
  dailyLimit: z.number().int().min(1).max(500).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform') as Platform | null;

    const accounts = await listAccounts(session.user.id, platform ?? undefined);

    return NextResponse.json({
      accounts: accounts.map((acc) => ({
        id: acc.id,
        platform: acc.platform,
        label: acc.label,
        proxyUrl: acc.proxyUrl,
        status: acc.status,
        healthScore: acc.healthScore,
        failCount: acc.failCount,
        dailySent: acc.dailySent,
        dailyLimit: acc.dailyLimit,
        lastFailAt: acc.lastFailAt?.toISOString() ?? null,
        lastSuccessAt: acc.lastSuccessAt?.toISOString() ?? null,
        createdAt: acc.createdAt.toISOString(),
        updatedAt: acc.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List sender accounts error:', error);
    return NextResponse.json(
      { error: '获取账号列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = createAccountSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const account = await createAccount({
      userId: session.user.id,
      platform: result.data.platform,
      label: result.data.label,
      cookies: result.data.cookies,
      proxyUrl: result.data.proxyUrl,
      dailyLimit: result.data.dailyLimit,
    });

    return NextResponse.json({
      account: {
        id: account.id,
        platform: account.platform,
        label: account.label,
        status: account.status,
        healthScore: account.healthScore,
        dailySent: account.dailySent,
        dailyLimit: account.dailyLimit,
        createdAt: account.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create sender account error:', error);
    return NextResponse.json({ error: '创建账号失败' }, { status: 500 });
  }
}
