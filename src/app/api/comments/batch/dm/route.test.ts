import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { clearDatabase, prisma } from '@/lib/test/setup';
import { createUser, createVideo, createComment } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';
import { addDmJob } from '@/lib/queue';

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
  return new NextRequest('http://localhost:3000/api/comments/batch/dm', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/comments/batch/dm（入队模式）', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.mocked(addDmJob).mockResolvedValue({ id: 'job-1' } as never);
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeRequest({ commentIds: ['c1'], content: '你好' }));
    expect(res.status).toBe(401);
  });

  it('批次超过剩余配额时返回 403', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    for (let i = 0; i < 9; i++) {
      await prisma.dm.create({
        data: { content: `历史私信 ${i}`, status: 'SENT', sentAt: new Date(), commentId: comment.id },
      });
    }
    const c1 = await createComment(video.id, { content: '评论1' });
    const c2 = await createComment(video.id, { content: '评论2' });
    mockSession(user.id);

    const res = await POST(makeRequest({ commentIds: [c1.id, c2.id], content: '您好，感谢关注' }));
    expect(res.status).toBe(403);
    expect(vi.mocked(addDmJob)).not.toHaveBeenCalled();
  });

  it('内容不合规时返回 400，不入队', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    mockSession(user.id);

    const res = await POST(
      makeRequest({ commentIds: [comment.id], content: '加我微信：abc123 免费领取资料' })
    );
    expect(res.status).toBe(400);
    expect(vi.mocked(addDmJob)).not.toHaveBeenCalled();
    expect(await prisma.dm.count()).toBe(0);
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
      makeRequest({ commentIds: [mine.id, others.id], content: '您好，感谢关注' })
    );
    expect(res.status).toBe(403);
  });

  it('校验通过后逐条创建 PENDING 私信并入队，返回 202', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const c1 = await createComment(video.id, { content: '评论1' });
    const c2 = await createComment(video.id, { content: '评论2' });
    mockSession(user.id);

    const res = await POST(
      makeRequest({ commentIds: [c1.id, c2.id], content: '您好，感谢关注' })
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.queued).toBe(true);
    expect(json.count).toBe(2);
    expect(json.failed).toBe(0);

    const dms = await prisma.dm.findMany({ where: { commentId: { in: [c1.id, c2.id] } } });
    expect(dms).toHaveLength(2);
    expect(dms.every((d) => d.status === 'PENDING')).toBe(true);

    expect(vi.mocked(addDmJob)).toHaveBeenCalledTimes(2);
    for (const commentId of [c1.id, c2.id]) {
      const dm = dms.find((d) => d.commentId === commentId)!;
      expect(vi.mocked(addDmJob)).toHaveBeenCalledWith(commentId, dm.id);
    }
    const after = await prisma.comment.findUnique({ where: { id: c1.id } });
    expect(after?.status).toBe('NEW');
  });

  it('单条入队失败不阻塞整批：该条标记 FAILED，其余正常入队', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const c1 = await createComment(video.id, { content: '评论1' });
    const c2 = await createComment(video.id, { content: '评论2' });
    vi.mocked(addDmJob)
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce({ id: 'job-2' } as never);
    mockSession(user.id);

    const res = await POST(
      makeRequest({ commentIds: [c1.id, c2.id], content: '您好，感谢关注' })
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.count).toBe(1);
    expect(json.failed).toBe(1);

    const failedDm = await prisma.dm.findFirst({ where: { commentId: c1.id } });
    expect(failedDm?.status).toBe('FAILED');
    const queuedDm = await prisma.dm.findFirst({ where: { commentId: c2.id } });
    expect(queuedDm?.status).toBe('PENDING');
  });
});
