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

function makeRequest(commentId: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/comments/${commentId}/dm`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const makeParams = (commentId: string) => ({ params: Promise.resolve({ id: commentId }) });

describe('POST /api/comments/[id]/dm（入队模式）', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.mocked(addDmJob).mockResolvedValue({ id: 'job-1' } as never);
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeRequest('c1', { content: '你好' }), makeParams('c1'));
    expect(res.status).toBe(401);
  });

  it('评论不存在时返回 404', async () => {
    const user = await createUser();
    mockSession(user.id);
    const res = await POST(makeRequest('not-exist', { content: '您好，感谢关注' }), makeParams('not-exist'));
    expect(res.status).toBe(404);
  });

  it('无权操作他人评论时返回 403', async () => {
    const user = await createUser();
    const other = await createUser();
    const otherVideo = await createVideo(other.id);
    const otherComment = await createComment(otherVideo.id);
    mockSession(user.id);

    const res = await POST(
      makeRequest(otherComment.id, { content: '您好，感谢关注' }),
      makeParams(otherComment.id)
    );
    expect(res.status).toBe(403);
  });

  it('今日私信配额（SENT 口径）用完时返回 403', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    for (let i = 0; i < 10; i++) {
      await prisma.dm.create({
        data: { content: `历史私信 ${i}`, status: 'SENT', sentAt: new Date(), commentId: comment.id },
      });
    }
    mockSession(user.id);

    const res = await POST(makeRequest(comment.id, { content: '您好，感谢关注' }), makeParams(comment.id));
    expect(res.status).toBe(403);
    expect(vi.mocked(addDmJob)).not.toHaveBeenCalled();
  });

  it('内容不合规时同步返回 400，不入队', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    mockSession(user.id);

    const res = await POST(
      makeRequest(comment.id, { content: '加我微信：abc123 免费领取资料' }),
      makeParams(comment.id)
    );
    expect(res.status).toBe(400);
    expect(vi.mocked(addDmJob)).not.toHaveBeenCalled();
    expect(await prisma.dm.count({ where: { commentId: comment.id } })).toBe(0);
  });

  it('校验通过后创建 PENDING 私信并入队，返回 202', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    mockSession(user.id);

    const res = await POST(
      makeRequest(comment.id, { content: '您好，感谢关注' }),
      makeParams(comment.id)
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.queued).toBe(true);
    expect(json.dm.status).toBe('PENDING');

    const dm = await prisma.dm.findUnique({ where: { id: json.dm.id } });
    expect(dm?.status).toBe('PENDING');
    expect(dm?.content).toBe('您好，感谢关注');
    expect(vi.mocked(addDmJob)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addDmJob)).toHaveBeenCalledWith(comment.id, dm!.id);
    // 同步直发不再发生：评论状态保持原样
    const after = await prisma.comment.findUnique({ where: { id: comment.id } });
    expect(after?.status).toBe('NEW');
  });

  it('入队失败时同步报错并把私信标记为 FAILED', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    vi.mocked(addDmJob).mockRejectedValue(new Error('redis down'));
    mockSession(user.id);

    const res = await POST(
      makeRequest(comment.id, { content: '您好，感谢关注' }),
      makeParams(comment.id)
    );

    expect(res.status).toBe(503);
    const dm = await prisma.dm.findFirst({ where: { commentId: comment.id } });
    expect(dm?.status).toBe('FAILED');
  });
});
