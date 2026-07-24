import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { postWebhook, buildTestAlert } from '@/lib/monitor/alert';

/**
 * 发送一条测试告警，使用当前已保存的配置。
 */
export async function POST() {
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

    if (!user?.alertEnabled || !user.alertChannelType || !user.alertWebhook) {
      return NextResponse.json(
        { error: '请先启用告警并配置 Webhook' },
        { status: 400 }
      );
    }

    const { title, content } = buildTestAlert();
    const ok = await postWebhook(user.alertWebhook, title, content);

    if (!ok) {
      return NextResponse.json(
        { error: 'Webhook 请求失败，请检查地址是否正确' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Test alert config error:', error);
    return NextResponse.json({ error: '发送测试告警失败' }, { status: 500 });
  }
}
