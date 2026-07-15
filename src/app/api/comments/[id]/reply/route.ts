import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { checkCompliance } from '@/lib/safety/compliance';
import { sendReplyToPlatform } from '@/lib/sender';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { z } from 'zod';

const replySchema = z.object({
  content: z.string().min(1, '回复内容不能为空').max(500, '回复内容太长').optional(),
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
    const limitCheck = await checkPlanLimit(session.user.id, plan, 'replies');
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.message }, { status: 403 });
    }

    const { id: commentId } = await params;
    const body = await req.json();
    const result = replySchema.safeParse(body);

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

    // 确定回复内容
    let replyContent = content;
    if (!replyContent && templateId) {
      const template = await prisma.replyTemplate.findFirst({
        where: { id: templateId, userId: session.user.id },
      });
      if (!template) {
        return NextResponse.json({ error: '话术模板不存在' }, { status: 404 });
      }
      replyContent = template.content;
    }
    if (!replyContent) {
      const defaultTemplate = await prisma.replyTemplate.findFirst({
        where: { userId: session.user.id, isDefault: true },
      });
      replyContent = defaultTemplate?.content || '感谢您的关注！';
    }

    // 合规检查
    const compliance = checkCompliance(replyContent);
    if (!compliance.compliant) {
      return NextResponse.json(
        { error: '内容不合规', issues: compliance.issues },
        { status: 400 }
      );
    }

    // 创建回复记录（初始状态 PENDING）
    const reply = await prisma.reply.create({
      data: {
        content: replyContent,
        status: 'PENDING',
        commentId,
      },
    });

    // 尝试发送到平台
    const sendResult = await sendReplyToPlatform({
      userId: session.user.id,
      platform: comment.video.platform,
      videoUrl: comment.video.url,
      commentId,
      authorName: comment.authorName,
      commentContent: comment.content,
      content: replyContent,
    });

    // 根据发送结果更新状态
    if (sendResult.success) {
      await prisma.$transaction([
        prisma.reply.update({
          where: { id: reply.id },
          data: { status: 'SENT', sentAt: new Date() },
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { status: 'REPLIED' },
        }),
      ]);

      await prisma.activity.create({
        data: {
          type: 'REPLY_SENT',
          description: `回复了用户 ${comment.authorName}`,
          metadata: { commentId, replyId: reply.id },
          userId: session.user.id,
        },
      });
    } else {
      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'FAILED' },
      });

      return NextResponse.json(
        {
          error: sendResult.error || '发送失败',
          reply: {
            id: reply.id,
            status: 'FAILED',
          },
        },
        { status: 502 }
      );
    }

    const updatedReply = await prisma.reply.findUnique({
      where: { id: reply.id },
    });

    return NextResponse.json({
      success: true,
      reply: {
        id: updatedReply!.id,
        content: updatedReply!.content,
        status: updatedReply!.status,
        sentAt: updatedReply!.sentAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Reply comment error:', error);
    return NextResponse.json({ error: '回复失败，请稍后重试' }, { status: 500 });
  }
}
