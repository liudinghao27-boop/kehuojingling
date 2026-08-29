import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { checkCompliance } from '@/lib/safety/compliance';
import { findSimilarContent } from '@/lib/safety/dedup';
import { getRecentOutgoingContents } from '@/lib/safety/recent-content';
import { generateSeedReply } from '@/lib/ai/seed-reply';
import { tryDecryptAiApiKey } from '@/lib/encryption';
import { sendReplyToPlatform } from '@/lib/sender';
import { randomDelay } from '@/lib/sender/utils';
import { checkPlanLimit, PlanType } from '@/lib/plans';
import { z } from 'zod';

const batchReplySchema = z.object({
  commentIds: z.array(z.string()).min(1, '至少选择一条评论'),
  content: z.string().max(500, '回复内容太长').optional(),
  templateId: z.string().optional(),
  /** 种草模式：每条评论单独生成差异化观点回复（推荐，防风控） */
  generate: z.boolean().optional(),
  /** 相似度/同质化告警时强制发送 */
  force: z.boolean().optional(),
});

/** 种草模式下最多一次生成的评论数（每条都要调 AI，限制规模保护成本与稳定性） */
const MAX_GENERATE_BATCH = 20;
const MAX_GENERATE_ATTEMPTS = 2;

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

    const { commentIds, content, templateId, generate, force } = result.data;

    const plan = (session.user.plan || 'FREE') as PlanType;
    const usage = await checkPlanLimit(session.user.id, plan, 'replies');
    const availableReplies = usage.usage.replies.limit - usage.usage.replies.used;
    if (commentIds.length > availableReplies) {
      return NextResponse.json(
        { error: `今日回复额度不足，还可发送 ${availableReplies} 条，当前选择了 ${commentIds.length} 条。` },
        { status: 403 }
      );
    }

    if (generate && commentIds.length > MAX_GENERATE_BATCH) {
      return NextResponse.json(
        { error: `种草模式单次最多 ${MAX_GENERATE_BATCH} 条（每条独立生成差异化内容），请分批操作` },
        { status: 400 }
      );
    }

    // 近期已发出话术（语义查重用）
    const recentContents = await getRecentOutgoingContents(session.user.id);

    let sharedContent = content;
    if (!generate) {
      if (!sharedContent && templateId) {
        const template = await prisma.replyTemplate.findFirst({
          where: { id: templateId, userId: session.user.id },
        });
        if (!template) {
          return NextResponse.json({ error: '话术模板不存在' }, { status: 404 });
        }
        sharedContent = template.content;
      }
      if (!sharedContent) {
        const defaultTemplate = await prisma.replyTemplate.findFirst({
          where: { userId: session.user.id, isDefault: true },
        });
        sharedContent = defaultTemplate?.content || '感谢您的关注！';
      }

      // 合规检查
      const compliance = checkCompliance(sharedContent);
      if (!compliance.compliant) {
        return NextResponse.json(
          { error: '内容不合规', issues: compliance.issues },
          { status: 400 }
        );
      }

      // 语义查重：与历史雷同
      const similarity = findSimilarContent(sharedContent, recentContents);
      if (similarity.similar && !force) {
        return NextResponse.json(
          {
            error: '内容与近期已发送话术过于相似，批量发送容易触发平台风控',
            code: 'CONTENT_TOO_SIMILAR',
            similarity: similarity.maxScore,
            matchedPreview: similarity.matchedContent?.slice(0, 50),
            suggestion: '建议改用种草模式（generate: true）为每条评论生成差异化回复',
          },
          { status: 409 }
        );
      }

      // 同质化警告：同一内容批量群发本身就是风控特征
      if (commentIds.length > 3 && !force) {
        return NextResponse.json(
          {
            error: `同一内容群发 ${commentIds.length} 条评论是典型营销号特征，极易被风控`,
            code: 'BATCH_IDENTICAL_CONTENT',
            suggestion: '建议改用种草模式（generate: true）让每条回复内容都不同，或确认风险后带 force 重试',
          },
          { status: 409 }
        );
      }
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

    // 种草模式：准备 AI 上下文
    let aiApiKey: string | undefined;
    let industryContext: string | null | undefined;
    if (generate) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { aiApiKey: true, industryContext: true },
      });
      aiApiKey = tryDecryptAiApiKey(user?.aiApiKey);
      industryContext = user?.industryContext;
    }

    // 逐条处理：先生成内容（种草模式），再创建记录并发送
    const now = new Date();
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let consecutiveFailures = 0;
    let stopped = false;
    const sentCommentIds: string[] = [];
    const batchGenerated: string[] = []; // 本批次已生成内容，批内也要互查重

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];

      let replyContent: string;
      let mode: 'seed' | null = null;

      if (generate) {
        const avoid = [...recentContents, ...batchGenerated];
        let candidate = '';
        for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt++) {
          candidate = await generateSeedReply({
            commentContent: comment.content,
            authorName: comment.authorName,
            videoTitle: comment.video.title ?? undefined,
            industryContext,
            intentScore: comment.intentScore,
            avoidContents: avoid,
            attempt,
            apiKey: aiApiKey,
          });
          const hit = findSimilarContent(candidate, avoid);
          if (!hit.similar) break;
        }
        const compliance = checkCompliance(candidate);
        if (!compliance.compliant) {
          failedCount++;
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            stopped = true;
            skippedCount = comments.length - i - 1;
            break;
          }
          continue;
        }
        replyContent = candidate;
        mode = 'seed';
        // 生成内容一经确定即计入批内查重（即使后续发送失败），保证同批不撞车
        batchGenerated.push(candidate);
      } else {
        replyContent = sharedContent!;
      }

      const reply = await prisma.reply.create({
        data: {
          content: replyContent,
          status: 'PENDING',
          mode,
          commentId: comment.id,
        },
      });

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
        description: generate
          ? `种草回复了 ${successCount} 位用户（每条差异化生成），${failedCount} 位失败，${skippedCount} 位跳过`
          : `批量回复了 ${successCount} 位用户，${failedCount} 位失败，${skippedCount} 位因风控未发送`,
        metadata: { commentIds, successCount, failedCount, skippedCount, stopped, mode: generate ? 'seed' : null },
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      count: successCount,
      failed: failedCount,
      skipped: skippedCount,
      stopped,
      mode: generate ? 'seed' : null,
    });
  } catch (error) {
    console.error('Batch reply error:', error);
    return NextResponse.json({ error: '批量回复失败，请稍后重试' }, { status: 500 });
  }
}
