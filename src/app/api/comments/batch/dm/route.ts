import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { checkCompliance } from '@/lib/safety/compliance';
import { sendDmToPlatform } from '@/lib/sender';
import { randomDelay } from '@/lib/sender/utils';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { z } from 'zod';

const batchDmSchema = z.object({
  commentIds: z.array(z.string()).min(1, '至少选择一条评论'),
  content: z.string().max(500, '私信内容太长').optional(),
  templateId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = batchDmSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { commentIds, content, templateId } = result.data;

    const plan = (session.user.plan || 'FREE') as PlanType;
    const usage = await checkPlanLimit(session.user.id, plan, 'dms');
    const availableDms = usage.usage.dms.limit - usage.usage.dms.used;
    if (commentIds.length > availableDms) {
      return NextResponse.json(
        { error: `今日私信额度不足，还可发送 ${availableDms} 条，当前选择了 ${commentIds.length} 条。` },
        { status: 403 }
      );
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

    // 批量创建 PENDING 私信
    const now = new Date();
    await prisma.dm.createMany({
      data: comments.map((comment) => ({
        content: dmContent,
        status: 'PENDING' as const,
        commentId: comment.id,
      })),
    });

    // 查询刚创建的私信记录
    const pendingDms = await prisma.dm.findMany({
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
      const dm = pendingDms.find((d) => d.commentId === comment.id);
      if (!dm) continue;

      await randomDelay(3000, 6000);

      const sendResult = await sendDmToPlatform({
        userId: session.user.id,
        platform: comment.video.platform,
        videoUrl: comment.video.url,
        commentId: comment.id,
        authorName: comment.authorName,
        content: dmContent,
      });

      if (sendResult.success) {
        successCount++;
        consecutiveFailures = 0;
        sentCommentIds.push(comment.id);
        await prisma.dm.update({
          where: { id: dm.id },
          data: { status: 'SENT', sentAt: now },
        });
      } else {
        failedCount++;
        consecutiveFailures++;
        await prisma.dm.update({
          where: { id: dm.id },
          data: { status: 'FAILED' },
        });

        if (consecutiveFailures >= 3) {
          stopped = true;
          skippedCount = comments.length - i - 1;
          break;
        }
      }
    }

    // 只有发送成功的评论才更新为 DM_SENT
    if (sentCommentIds.length > 0) {
      await prisma.comment.updateMany({
        where: { id: { in: sentCommentIds } },
        data: { status: 'DM_SENT' },
      });
    }

    // 记录活动
    await prisma.activity.create({
      data: {
        type: 'DM_SENT',
        description: `批量私信了 ${successCount} 位用户，${failedCount} 位失败，${skippedCount} 位因风控未发送`,
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
    console.error('Batch dm error:', error);
    return NextResponse.json({ error: '批量私信失败，请稍后重试' }, { status: 500 });
  }
}
