import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { clearDatabase, prisma } from '@/lib/test/setup';
import { createUser, createVideo, createComment } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';
import { addReplyJob } from '@/lib/queue';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

// 队列模块整体 mock：路由只负责入队，真实发送由 processSendJob 承担
vi.mock('@/lib/queue', () => ({
  addReplyJob: vi.fn(),
  addDmJob: vi.fn(),
}));

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User', plan: 'FREE' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/comments/batch/reply', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/comments/batch/reply（入队模式）', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.mocked(addReplyJob).mockResolvedValue({ id: 'job-1' } as never);
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeRequest({ commentIds: ['c1'], content: '你好' }));
    expect(res.status).toBe(401);
  });

  it('commentIds 为空时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const res = await POST(makeRequest({ commentIds: [], content: '你好' }));
    expect(res.status).toBe(400);
  });

  it('批次超过剩余配额时返回 403', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    // FREE 上限 10：已发 9 条，剩 1 条额度，选 2 条评论 → 拒绝
    for (let i = 0; i < 9; i++) {
      await prisma.reply.create({
        data: { content: `历史回复 ${i}`, status: 'SENT', sentAt: new Date(), commentId: comment.id },
      });
    }
    const c1 = await createComment(video.id, { content: '评论1' });
    const c2 = await createComment(video.id, { content: '评论2' });
    mockSession(user.id);

    const res = await POST(makeRequest({ commentIds: [c1.id, c2.id], content: '感谢关注，欢迎交流' }));
    expect(res.status).toBe(403);
    expect(vi.mocked(addReplyJob)).not.toHaveBeenCalled();
  });

  it('同一内容群发超过 3 条时返回 409 同质化拦截', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comments = await Promise.all(
      [1, 2, 3, 4].map((i) => createComment(video.id, { content: `评论${i}` }))
    );
    mockSession(user.id);

    const res = await POST(
      makeRequest({ commentIds: comments.map((c) => c.id), content: '感谢关注，欢迎交流' })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('BATCH_IDENTICAL_CONTENT');
    expect(vi.mocked(addReplyJob)).not.toHaveBeenCalled();
  });

  it('内容与近期已发话术雷同时返回 409', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    await prisma.reply.create({
      data: { content: '感谢关注，欢迎交流', status: 'SENT', sentAt: new Date(), commentId: comment.id },
    });
    const c1 = await createComment(video.id, { content: '评论1' });
    mockSession(user.id);

    const res = await POST(makeRequest({ commentIds: [c1.id], content: '感谢关注，欢迎交流' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('CONTENT_TOO_SIMILAR');
    expect(vi.mocked(addReplyJob)).not.toHaveBeenCalled();
  });

  it('部分评论不存在时返回 404', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    mockSession(user.id);

    const res = await POST(
      makeRequest({ commentIds: [comment.id, 'not-exist'], content: '感谢关注，欢迎交流', force: true })
    );
    expect(res.status).toBe(404);
  });

  it('包含他人评论时返回 403', async () => {
    const user = await createUser();
    const other = await createUser();
    const video = await createVideo(user.id);
    const otherVideo = await createVideo(other.id);
    const mine = await createComment(video.id);
    const others = await createComment(otherVideo.id);
    mockSession(user.id);

    const res = await POST(
      makeRequest({ commentIds: [mine.id, others.id], content: '感谢关注，欢迎交流', force: true })
    );
    expect(res.status).toBe(403);
  });

  it('校验通过后逐条创建 PENDING 回复并入队，返回 202', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const c1 = await createComment(video.id, { content: '评论1' });
    const c2 = await createComment(video.id, { content: '评论2' });
    mockSession(user.id);

    const res = await POST(
      makeRequest({ commentIds: [c1.id, c2.id], content: '感谢关注，欢迎交流' })
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.queued).toBe(true);
    expect(json.count).toBe(2);
    expect(json.failed).toBe(0);

    const replies = await prisma.reply.findMany({ where: { commentId: { in: [c1.id, c2.id] } } });
    expect(replies).toHaveLength(2);
    expect(replies.every((r) => r.status === 'PENDING')).toBe(true);

    expect(vi.mocked(addReplyJob)).toHaveBeenCalledTimes(2);
    for (const commentId of [c1.id, c2.id]) {
      const reply = replies.find((r) => r.commentId === commentId)!;
      expect(vi.mocked(addReplyJob)).toHaveBeenCalledWith(commentId, reply.id);
    }
    // 同步直发不再发生：评论状态不由路由更新
    const after = await prisma.comment.findUnique({ where: { id: c1.id } });
    expect(after?.status).toBe('NEW');
  });

  it('单条入队失败不阻塞整批：该条标记 FAILED，其余正常入队', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const c1 = await createComment(video.id, { content: '评论1' });
    const c2 = await createComment(video.id, { content: '评论2' });
    vi.mocked(addReplyJob)
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce({ id: 'job-2' } as never);
    mockSession(user.id);

    const res = await POST(
      makeRequest({ commentIds: [c1.id, c2.id], content: '感谢关注，欢迎交流' })
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.count).toBe(1);
    expect(json.failed).toBe(1);

    const failedReply = await prisma.reply.findFirst({ where: { commentId: c1.id } });
    expect(failedReply?.status).toBe('FAILED');
    const queuedReply = await prisma.reply.findFirst({ where: { commentId: c2.id } });
    expect(queuedReply?.status).toBe('PENDING');
  });
});
