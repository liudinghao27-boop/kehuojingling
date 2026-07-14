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

    const userId = session.user.id;

    const [videos, comments, highIntent, replies, dms, converted] = await Promise.all([
      prisma.video.count({ where: { userId } }),
      prisma.comment.count({ where: { video: { userId } } }),
      prisma.comment.count({ where: { video: { userId }, intentScore: { gte: 4 } } }),
      prisma.reply.count({ where: { comment: { video: { userId } } } }),
      prisma.dm.count({ where: { comment: { video: { userId } } } }),
      prisma.comment.count({ where: { video: { userId }, status: 'CONVERTED' } }),
    ]);

    const funnel = [
      { label: '评论', value: comments, percent: comments > 0 ? '100%' : '0%' },
      {
        label: '高意向',
        value: highIntent,
        percent: comments > 0 ? `${((highIntent / comments) * 100).toFixed(1)}%` : '0%',
      },
      {
        label: '已回复',
        value: replies,
        percent: comments > 0 ? `${((replies / comments) * 100).toFixed(1)}%` : '0%',
      },
      {
        label: '已私信',
        value: dms,
        percent: comments > 0 ? `${((dms / comments) * 100).toFixed(1)}%` : '0%',
      },
      {
        label: '已转化',
        value: converted,
        percent: comments > 0 ? `${((converted / comments) * 100).toFixed(1)}%` : '0%',
      },
    ];

    return NextResponse.json({
      stats: {
        videos,
        comments,
        highIntent,
        replies,
        dms,
        converted,
      },
      funnel,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: '获取统计数据失败' }, { status: 500 });
  }
}
