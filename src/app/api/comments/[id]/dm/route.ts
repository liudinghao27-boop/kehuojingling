import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { checkCompliance } from '@/lib/safety/compliance';
import { sendDmToPlatform } from '@/lib/sender';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { z } from 'zod';

const dmSchema = z.object({
  content: z.string().min(1, '私信内容不能为空').max(500, '私信内容太长').optional(),
  templateId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const plan = (session.user.plan || 'FREE') as PlanType;
    const limitCheck = await checkPlanLimit(session.user.id, plan, 'dms');
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.message }, { status: 403 });
    }

    const { id: commentId } = await params;
    const body = await req.json();
    const result = dmSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { content, templateId } = result.data;

    // 获取评论信息
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { video: true },
    });

    if (!comment) {
      return NextResponse.json({ error: '评论不存在' }, { status: 404 });
    }

    if (comment.video.userId !== session.user.id) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 });
    }

    // 确定私信内容
    let dmContent = content;
    if (!dmContent && templateId) {
      const template = await prisma.dmTemplate.findFirst({
        where: { id: templateId, userId: session.user.id },
      });
      if (!template) {
        return NextResponse.json({ error: '话术模板不存在' }, { status: 404 });
      }
      dmContent = template.content;
    }
    if (!dmContent) {
      const defaultTemplate = await prisma.dmTemplate.findFirst({
        where: { userId: session.user.id, isDefault: true },
      });
      dmContent = defaultTemplate?.content || '您好！感谢您的关注。';
    }

    // 合规检查
    const compliance = checkCompliance(dmContent);
    if (!compliance.compliant) {
      return NextResponse.json(
        { error: '内容不合规', issues: compliance.issues },
        { status: 400 }
      );
    }

    // 创建私信记录（初始状态 PENDING）
    const dm = await prisma.dm.create({
      data: {
        content: dmContent,
        status: 'PENDING',
        commentId,
      },
    });

    // 尝试发送到平台
    const sendResult = await sendDmToPlatform({
      userId: session.user.id,
      platform: comment.video.platform,
      videoUrl: comment.video.url,
      commentId,
      authorName: comment.authorName,
      content: dmContent,
    });

    // 根据发送结果更新状态
    if (sendResult.success) {
      await prisma.$transaction([
        prisma.dm.update({
          where: { id: dm.id },
          data: { status: 'SENT', sentAt: new Date() },
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { status: 'DM_SENT' },
        }),
      ]);

      await prisma.activity.create({
        data: {
          type: 'DM_SENT',
          description: `私信了用户 ${comment.authorName}`,
          metadata: { commentId, dmId: dm.id },
          userId: session.user.id,
        },
      });
    } else {
      await prisma.dm.update({
        where: { id: dm.id },
        data: { status: 'FAILED' },
      });

      return NextResponse.json(
        {
          error: sendResult.error || '发送失败',
          dm: {
            id: dm.id,
            status: 'FAILED',
          },
        },
        { status: 502 }
      );
    }

    const updatedDm = await prisma.dm.findUnique({
      where: { id: dm.id },
    });

    return NextResponse.json({
      success: true,
      dm: {
        id: updatedDm!.id,
        content: updatedDm!.content,
        status: updatedDm!.status,
        sentAt: updatedDm!.sentAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('DM comment error:', error);
    return NextResponse.json({ error: '私信失败，请稍后重试' }, { status: 500 });
  }
}
