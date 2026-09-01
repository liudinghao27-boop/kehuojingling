import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { checkCompliance } from '@/lib/safety/compliance';
import { addDmJob } from '@/lib/queue';
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

    // 逐条创建 PENDING 私信并入队；发送动作由 worker 异步执行（账号池/限流/安全窗口在队列侧生效）
    let queuedCount = 0;
    let failedCount = 0;

    for (const comment of comments) {
      const dm = await prisma.dm.create({
        data: {
          content: dmContent,
          status: 'PENDING',
          commentId: comment.id,
        },
      });

      try {
        await addDmJob(comment.id, dm.id);
        queuedCount++;
      } catch (queueError) {
        // 单条入队失败不阻塞整批：标记该条 FAILED，其余继续
        console.error(`Batch dm enqueue error for comment ${comment.id}:`, queueError);
        await prisma.dm.update({
          where: { id: dm.id },
          data: { status: 'FAILED' },
        });
        failedCount++;
      }
    }

    // 记录入队动作（每条发送结果由 worker 另行记录）
    await prisma.activity.create({
      data: {
        type: 'DM_SENT',
        description: `已将 ${queuedCount} 条私信加入发送队列${failedCount > 0 ? `，${failedCount} 条未入队` : ''}`,
        metadata: { commentIds, queuedCount, failedCount, queued: true },
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      {
        queued: true,
        count: queuedCount,
        failed: failedCount,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Batch dm error:', error);
    return NextResponse.json({ error: '批量私信失败，请稍后重试' }, { status: 500 });
  }
}
