import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { checkCompliance } from '@/lib/safety/compliance';
import { addDmJob } from '@/lib/queue';
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

    // 创建私信记录（初始状态 PENDING），发送动作异步化：入队后由 worker 经账号池/限流/安全窗口发出
    const dm = await prisma.dm.create({
      data: {
        content: dmContent,
        status: 'PENDING',
        commentId,
      },
    });

    try {
      await addDmJob(commentId, dm.id);
    } catch (queueError) {
      // 入队失败：标记失败并同步报错，避免记录永远挂在 PENDING
      console.error('DM enqueue error:', queueError);
      await prisma.dm.update({
        where: { id: dm.id },
        data: { status: 'FAILED' },
      });
      return NextResponse.json({ error: '发送队列不可用，请稍后重试' }, { status: 503 });
    }

    // 记录入队动作（发送结果由 worker 另行记录）
    await prisma.activity.create({
      data: {
        type: 'DM_SENT',
        description: `私信已加入发送队列（用户 ${comment.authorName}）`,
        metadata: { commentId, dmId: dm.id, queued: true },
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      {
        queued: true,
        dm: {
          id: dm.id,
          content: dm.content,
          status: dm.status,
          sentAt: dm.sentAt?.toISOString(),
        },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('DM comment error:', error);
    return NextResponse.json({ error: '私信失败，请稍后重试' }, { status: 500 });
  }
}
