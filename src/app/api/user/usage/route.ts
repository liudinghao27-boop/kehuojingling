import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getCurrentUsage, PlanType } from '@/lib/plans';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const plan = (session.user.plan || 'FREE') as PlanType;
    const usage = await getCurrentUsage(session.user.id, plan);

    return NextResponse.json({ usage });
  } catch (error) {
    console.error('Get usage error:', error);
    return NextResponse.json({ error: '获取额度失败' }, { status: 500 });
  }
}
