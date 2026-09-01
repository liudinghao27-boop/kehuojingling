import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { checkCompliance } from '@/lib/safety/compliance';
import { findSimilarContent } from '@/lib/safety/dedup';
import { getRecentOutgoingContents } from '@/lib/safety/recent-content';
import { generateSeedReply } from '@/lib/ai/seed-reply';
import { tryDecryptAiApiKey } from '@/lib/encryption';
import { addReplyJob } from '@/lib/queue';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { z } from 'zod';

const replySchema = z.object({
  content: z.string().min(1, '回复内容不能为空').max(500, '回复内容太长').optional(),
  templateId: z.string().optional(),
  /** 种草模式：AI 生成观点性回复（防风控的 2026 合规截流打法） */
  generate: z.boolean().optional(),
  /** 相似度告警时强制发送 */
  force: z.boolean().optional(),
});

const MAX_GENERATE_ATTEMPTS = 3;

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

    const { content, templateId, generate, force } = result.data;

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

    // 近期已发出话术（语义查重用）
    const recentContents = await getRecentOutgoingContents(session.user.id);

    let replyContent: string | undefined;
    let mode: 'seed' | null = null;
    let generated = false;
    let regenerateAttempts = 0;

    if (generate) {
      // 种草模式：AI 生成观点性回复，逐次检查语义查重，太像就换角度重新生成
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { aiApiKey: true, industryContext: true },
      });
      const aiApiKey = tryDecryptAiApiKey(user?.aiApiKey);

      for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt++) {
        const candidate = await generateSeedReply({
          commentContent: comment.content,
          authorName: comment.authorName,
          videoTitle: comment.video.title ?? undefined,
          industryContext: user?.industryContext,
          intentScore: comment.intentScore,
          avoidContents: recentContents,
          attempt,
          apiKey: aiApiKey,
        });
        regenerateAttempts = attempt;
        const hit = findSimilarContent(candidate, recentContents);
        if (!hit.similar || attempt === MAX_GENERATE_ATTEMPTS) {
          replyContent = candidate;
          break;
        }
      }
      mode = 'seed';
      generated = true;
    } else {
      replyContent = content;
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
    }

    if (!replyContent) {
      return NextResponse.json({ error: '生成回复内容失败，请重试' }, { status: 500 });
    }

    // 合规检查
    const compliance = checkCompliance(replyContent);
    if (!compliance.compliant) {
      return NextResponse.json(
        { error: '内容不合规', issues: compliance.issues },
        { status: 400 }
      );
    }

    // 发出端语义查重（防风控）：与近期已发内容雷同则拦截，除非 force
    const similarity = findSimilarContent(replyContent, recentContents);
    if (similarity.similar && !force) {
      return NextResponse.json(
        {
          error: '内容与近期已发送话术过于相似，直接发送容易触发平台风控',
          code: 'CONTENT_TOO_SIMILAR',
          similarity: similarity.maxScore,
          matchedPreview: similarity.matchedContent?.slice(0, 50),
          suggestion: '建议改用种草模式（generate: true）生成差异化观点回复，或改写后带 force 重试',
        },
        { status: 409 }
      );
    }

    // 创建回复记录（初始状态 PENDING），发送动作异步化：入队后由 worker 经账号池/限流/安全窗口发出
    const reply = await prisma.reply.create({
      data: {
        content: replyContent,
        status: 'PENDING',
        mode,
        commentId,
      },
    });

    try {
      await addReplyJob(commentId, reply.id);
    } catch (queueError) {
      // 入队失败：标记失败并同步报错，避免记录永远挂在 PENDING
      console.error('Reply enqueue error:', queueError);
      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'FAILED' },
      });
      return NextResponse.json({ error: '发送队列不可用，请稍后重试' }, { status: 503 });
    }

    // 记录入队动作（发送结果由 worker 另行记录）
    await prisma.activity.create({
      data: {
        type: 'REPLY_SENT',
        description: mode === 'seed'
          ? `种草回复已加入发送队列（用户 ${comment.authorName}）`
          : `回复已加入发送队列（用户 ${comment.authorName}）`,
        metadata: { commentId, replyId: reply.id, mode, queued: true },
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      {
        queued: true,
        reply: {
          id: reply.id,
          content: reply.content,
          status: reply.status,
          mode: reply.mode,
          sentAt: reply.sentAt?.toISOString(),
        },
        dedup: {
          maxSimilarity: similarity.maxScore,
          generated,
          regenerateAttempts: generated ? regenerateAttempts : 0,
        },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Reply comment error:', error);
    return NextResponse.json({ error: '回复失败，请稍后重试' }, { status: 500 });
  }
}
