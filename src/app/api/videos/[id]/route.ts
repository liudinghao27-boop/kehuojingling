import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { addScrapeJob } from '@/lib/queue';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['MONITORING', 'PAUSED', 'COMPLETED', 'ERROR']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const result = updateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.video.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '视频不存在' }, { status: 404 });
    }

    const video = await prisma.video.update({
      where: { id },
      data: { status: result.data.status },
    });

    return NextResponse.json({
      success: true,
      video: {
        id: video.id,
        status: video.status,
      },
    });
  } catch (error) {
    console.error('Update video error:', error);
    return NextResponse.json({ error: '更新视频状态失败' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.video.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '视频不存在' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.reply.deleteMany({ where: { comment: { videoId: id } } }),
      prisma.dm.deleteMany({ where: { comment: { videoId: id } } }),
      prisma.comment.deleteMany({ where: { videoId: id } }),
      prisma.video.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete video error:', error);
    return NextResponse.json({ error: '删除视频失败' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.video.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '视频不存在' }, { status: 404 });
    }

    await addScrapeJob(existing.id, existing.url);

    return NextResponse.json({ success: true, message: '已加入抓取队列' });
  } catch (error) {
    console.error('Trigger scrape error:', error);
    return NextResponse.json({ error: '触发抓取失败' }, { status: 500 });
  }
}
