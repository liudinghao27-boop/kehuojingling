import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { checkCompliance } from '@/lib/safety/compliance';
import { sendReplyToPlatform } from '@/lib/sender';
import { randomDelay } from '@/lib/sender/utils';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { z } from 'zod';

const batchReplySchema = z.object({
  commentIds: z.array(z.string()).min(1, '至少选择一条评论'),
  content: z.string().max(500, '回复内容太长').optional(),
  templateId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = batchReplySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { commentIds, content, templateId } = result.data;

    const plan = (session.user.plan || 'FREE') as PlanType;
    const usage = await checkPlanLimit(session.user.id, plan, 'replies');
    const availableReplies = usage.usage.replies.limit - usage.usage.replies.used;
    if (commentIds.length > availableReplies) {
      return NextResponse.json(
        { error: `今日回复额度不足，还可发送 ${availableReplies} 条，当前选择了 ${commentIds.length} 条。` },
        { status: 403 }
      );
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

    // 校验所有评论归属当前用户
    const comments = await prisma.comment.findMany({
      where: { id: { in: commentIds } },
      include: { video: true },
    });

    if (comments.length !== commentIds.length) {
      return NextResponse.json({ error: '部分评论不存在' }, { status: 404 });
    }

    const unauthorized = comments.some((c) => c.video.userId !== session.user.id);
    if (unauthorized) {
      return NextResponse.json({ error: '无权操作部分评论' }, { status: 403 });
    }

    // 批量创建 PENDING 回复
    const now = new Date();
    await prisma.reply.createMany({
      data: comments.map((comment) => ({
        content: replyContent,
        status: 'PENDING' as const,
        commentId: comment.id,
      })),
    });

    // 查询刚创建的回复记录
    const pendingReplies = await prisma.reply.findMany({
      where: { commentId: { in: commentIds } },
      orderBy: { createdAt: 'desc' },
      take: comments.length,
    });

    // 逐个尝试发送
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let consecutiveFailures = 0;
    let stopped = false;
    const sentCommentIds: string[] = [];

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      const reply = pendingReplies.find((r) => r.commentId === comment.id);
      if (!reply) continue;

      await randomDelay(3000, 6000);

      const sendResult = await sendReplyToPlatform({
        userId: session.user.id,
        platform: comment.video.platform,
        videoUrl: comment.video.url,
        commentId: comment.id,
        authorName: comment.authorName,
        commentContent: comment.content,
        content: replyContent,
      });

      if (sendResult.success) {
        successCount++;
        consecutiveFailures = 0;
        sentCommentIds.push(comment.id);
        await prisma.reply.update({
          where: { id: reply.id },
          data: { status: 'SENT', sentAt: now },
        });
      } else {
        failedCount++;
        consecutiveFailures++;
        await prisma.reply.update({
          where: { id: reply.id },
          data: { status: 'FAILED' },
        });

        if (consecutiveFailures >= 3) {
          stopped = true;
          skippedCount = comments.length - i - 1;
          break;
        }
      }
    }

    // 只有发送成功的评论才更新为 REPLIED
    if (sentCommentIds.length > 0) {
      await prisma.comment.updateMany({
        where: { id: { in: sentCommentIds } },
        data: { status: 'REPLIED' },
      });
    }

    // 记录活动
    await prisma.activity.create({
      data: {
        type: 'REPLY_SENT',
        description: `批量回复了 ${successCount} 位用户，${failedCount} 位失败，${skippedCount} 位因风控未发送`,
        metadata: { commentIds, successCount, failedCount, skippedCount, stopped },
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      count: successCount,
      failed: failedCount,
      skipped: skippedCount,
      stopped,
    });
  } catch (error) {
    console.error('Batch reply error:', error);
    return NextResponse.json({ error: '批量回复失败，请稍后重试' }, { status: 500 });
  }
}
