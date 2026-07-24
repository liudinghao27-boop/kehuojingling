import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateAlertConfigSchema = z.object({
  enabled: z.boolean().optional(),
  channelType: z.enum(['dingtalk', 'wecom']).nullable().optional(),
  webhook: z.string().url('Webhook 必须是合法 URL').nullable().optional(),
});

function toConfig(user: {
  alertEnabled: boolean;
  alertChannelType: string | null;
  alertWebhook: string | null;
}) {
  return {
    enabled: user.alertEnabled,
    channelType: (user.alertChannelType as 'dingtalk' | 'wecom' | null) ?? null,
    webhook: user.alertWebhook,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        alertEnabled: true,
        alertChannelType: true,
        alertWebhook: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({ config: toConfig(user) });
  } catch (error) {
    console.error('Get alert config error:', error);
    return NextResponse.json({ error: '获取告警配置失败' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = updateAlertConfigSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const data: {
      alertEnabled?: boolean;
      alertChannelType?: string | null;
      alertWebhook?: string | null;
    } = {};
    if (result.data.enabled !== undefined) data.alertEnabled = result.data.enabled;
    if (result.data.channelType !== undefined) data.alertChannelType = result.data.channelType;
    if (result.data.webhook !== undefined) data.alertWebhook = result.data.webhook;

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: {
        alertEnabled: true,
        alertChannelType: true,
        alertWebhook: true,
      },
    });

    return NextResponse.json({ config: toConfig(user) });
  } catch (error) {
    console.error('Update alert config error:', error);
    return NextResponse.json({ error: '更新告警配置失败' }, { status: 500 });
  }
}
