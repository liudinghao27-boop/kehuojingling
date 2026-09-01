import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase, prisma } from '@/lib/test/setup';
import { createUser, createVideo, createComment } from '@/lib/test/factories';
import { getCurrentUsage, checkPlanLimit } from './index';

/**
 * 配额口径（P1-2）：回复/私信用量 = Reply/Dm 表中今日实际发送成功（SENT）的记录数，
 * 不再依赖 Activity 计数（批量场景每次只记 1 条导致漏计）。
 */
describe('getCurrentUsage 配额口径', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('回复用量数今日 SENT 的 Reply 记录', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);

    await prisma.reply.create({
      data: { content: '已发出', status: 'SENT', sentAt: new Date(), commentId: comment.id },
    });
    // PENDING（队列中）与 FAILED 不计入已用量
    await prisma.reply.create({
      data: { content: '排队中', status: 'PENDING', commentId: comment.id },
    });
    await prisma.reply.create({
      data: { content: '失败的', status: 'FAILED', commentId: comment.id },
    });

    const usage = await getCurrentUsage(user.id, 'FREE');
    expect(usage.replies.used).toBe(1);
    expect(usage.replies.limit).toBe(10);
  });

  it('私信用量数今日 SENT 的 Dm 记录', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);

    await prisma.dm.create({
      data: { content: '已发出', status: 'SENT', sentAt: new Date(), commentId: comment.id },
    });
    await prisma.dm.create({
      data: { content: '失败的', status: 'FAILED', commentId: comment.id },
    });

    const usage = await getCurrentUsage(user.id, 'FREE');
    expect(usage.dms.used).toBe(1);
  });

  it('昨天的 SENT 记录不计入今日用量', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.reply.create({
      data: { content: '昨天的', status: 'SENT', sentAt: yesterday, createdAt: yesterday, commentId: comment.id },
    });

    const usage = await getCurrentUsage(user.id, 'FREE');
    expect(usage.replies.used).toBe(0);
  });

  it('其他用户的 SENT 记录不计入', async () => {
    const user = await createUser();
    const other = await createUser();
    const otherVideo = await createVideo(other.id);
    const otherComment = await createComment(otherVideo.id);
    await prisma.reply.create({
      data: { content: '别人的', status: 'SENT', sentAt: new Date(), commentId: otherComment.id },
    });

    const usage = await getCurrentUsage(user.id, 'FREE');
    expect(usage.replies.used).toBe(0);
  });

  it('不再按 Activity 计数：REPLY_SENT 活动不影响用量', async () => {
    const user = await createUser();
    await prisma.activity.create({
      data: { type: 'REPLY_SENT', description: '历史活动记录', userId: user.id },
    });

    const usage = await getCurrentUsage(user.id, 'FREE');
    expect(usage.replies.used).toBe(0);
  });
});

describe('checkPlanLimit', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('今日 SENT 达到套餐上限时拒绝', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);

    // FREE 每日回复上限 10 条
    for (let i = 0; i < 10; i++) {
      await prisma.reply.create({
        data: { content: `回复 ${i}`, status: 'SENT', sentAt: new Date(), commentId: comment.id },
      });
    }

    const result = await checkPlanLimit(user.id, 'FREE', 'replies');
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('10/10');
  });

  it('未达上限时放行', async () => {
    const user = await createUser();
    const result = await checkPlanLimit(user.id, 'FREE', 'replies');
    expect(result.allowed).toBe(true);
  });
});
