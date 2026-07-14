import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const items = await prisma.activity.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Fetch activities error:', error);
    return NextResponse.json({ error: '获取操作日志失败' }, { status: 500 });
  }
}
