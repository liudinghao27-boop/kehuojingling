import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';

/**
 * 发送账号统计。
 *
 * todaySent / todayFailed 口径：今日（本地时区 0 点起）创建的、
 * 属于当前用户视频评论的 replies + dms 记录中，状态为 SENT / FAILED 的数量。
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const userId = session.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const scopedWhere = {
      createdAt: { gte: todayStart },
      comment: { video: { userId } },
    };

    const [
      total,
      active,
      cooling,
      disabled,
      expired,
      healthAgg,
      limitAgg,
      repliesSent,
      repliesFailed,
      dmsSent,
      dmsFailed,
    ] = await Promise.all([
      prisma.senderAccount.count({ where: { userId } }),
      prisma.senderAccount.count({ where: { userId, status: 'ACTIVE' } }),
      prisma.senderAccount.count({ where: { userId, status: 'COOLING' } }),
      prisma.senderAccount.count({ where: { userId, status: 'DISABLED' } }),
      prisma.senderAccount.count({ where: { userId, status: 'EXPIRED' } }),
      prisma.senderAccount.aggregate({
        where: { userId },
        _avg: { healthScore: true },
      }),
      prisma.senderAccount.aggregate({
        where: { userId },
        _sum: { dailyLimit: true },
      }),
      prisma.reply.count({ where: { ...scopedWhere, status: 'SENT' } }),
      prisma.reply.count({ where: { ...scopedWhere, status: 'FAILED' } }),
      prisma.dm.count({ where: { ...scopedWhere, status: 'SENT' } }),
      prisma.dm.count({ where: { ...scopedWhere, status: 'FAILED' } }),
    ]);

    const todaySent = repliesSent + dmsSent;
    const todayFailed = repliesFailed + dmsFailed;
    const denominator = todaySent + todayFailed;

    return NextResponse.json({
      stats: {
        total,
        active,
        cooling,
        disabled,
        expired,
        avgHealthScore: Math.round(healthAgg._avg.healthScore ?? 0),
        todaySent,
        todayLimit: limitAgg._sum.dailyLimit ?? 0,
        todayFailed,
        failureRate: denominator === 0 ? 0 : todayFailed / denominator,
      },
    });
  } catch (error) {
    console.error('Get sender accounts stats error:', error);
    return NextResponse.json({ error: '获取账号统计失败' }, { status: 500 });
  }
}
