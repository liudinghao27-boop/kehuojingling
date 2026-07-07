import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { generateReplySuggestion, analyzeIntentWithAI } from '@/lib/ai/intent';
import { checkCompliance } from '@/lib/safety/compliance';
import { z } from 'zod';

const replySchema = z.object({
  commentId: z.string(),
  content: z.string().min(1, '回复内容不能为空').max(500, '回复内容太长'),
  type: z.enum(['reply', 'dm']).default('reply'),
});

// POST: 发送回复或私信
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = replySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { commentId, content, type } = result.data;

    // 合规检查
    const compliance = checkCompliance(content);
    if (!compliance.compliant) {
      return NextResponse.json(
        { error: '内容不合规', issues: compliance.issues },
        { status: 400 }
      );
    }

    // 获取评论信息
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { video: true },
    });

    if (!comment) {
      return NextResponse.json({ error: '评论不存在' }, { status: 404 });
    }

    // 检查权限
    if (comment.video.userId !== session.user.id) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 });
    }

    if (type === 'reply') {
      // 创建回复记录
      const reply = await prisma.reply.create({
        data: {
          content,
          status: 'SENT',
          sentAt: new Date(),
          commentId,
        },
      });

      // 更新评论状态
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'REPLIED' },
      });

      // 记录活动
      await prisma.activity.create({
        data: {
          type: 'REPLY_SENT',
          description: `回复了用户 ${comment.authorName}`,
          metadata: { commentId, replyId: reply.id },
          userId: session.user.id,
        },
      });

      return NextResponse.json({
        success: true,
        reply: {
          id: reply.id,
          content: reply.content,
          sentAt: reply.sentAt,
        },
      });
    } else {
      // 创建私信记录
      const dm = await prisma.dm.create({
        data: {
          content,
          status: 'SENT',
          sentAt: new Date(),
          commentId,
        },
      });

      // 更新评论状态
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'DM_SENT' },
      });

      // 记录活动
      await prisma.activity.create({
        data: {
          type: 'DM_SENT',
          description: `私信了用户 ${comment.authorName}`,
          metadata: { commentId, dmId: dm.id },
          userId: session.user.id,
        },
      });

      return NextResponse.json({
        success: true,
        dm: {
          id: dm.id,
          content: dm.content,
          sentAt: dm.sentAt,
        },
      });
    }
  } catch (error) {
    console.error('Send reply error:', error);
    return NextResponse.json(
      { error: '发送失败，请稍后重试' },
      { status: 500 }
    );
  }
}

// GET: 获取回复建议
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json({ error: '缺少评论ID' }, { status: 400 });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return NextResponse.json({ error: '评论不存在' }, { status: 404 });
    }

    // 分析意向
    const intent = await analyzeIntentWithAI(comment.content);
    
    // 获取用户的话术模板
    const templates = await prisma.replyTemplate.findMany({
      where: { userId: session.user.id },
      take: 5,
    });

    const defaultTemplate = templates.find(t => t.isDefault)?.content;
    
    // 生成回复建议
    const suggestion = await generateReplySuggestion(
      comment.content,
      intent,
      defaultTemplate
    );

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        authorName: comment.authorName,
      },
      analysis: intent,
      suggestion,
      templates: templates.map(t => ({ id: t.id, name: t.name, content: t.content })),
    });
  } catch (error) {
    console.error('Get suggestion error:', error);
    return NextResponse.json(
      { error: '获取建议失败' },
      { status: 500 }
    );
  }
}
