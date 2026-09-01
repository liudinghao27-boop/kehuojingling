import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { clearDatabase, prisma } from '@/lib/test/setup';
import { createUser, createVideo, createComment } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';
import { addReplyJob } from '@/lib/queue';
import { generateSeedReply } from '@/lib/ai/seed-reply';

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

vi.mock('@/lib/ai/seed-reply', () => ({
  generateSeedReply: vi.fn(),
}));

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User', plan: 'FREE' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

function makeRequest(commentId: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/comments/${commentId}/reply`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const makeParams = (commentId: string) => ({ params: Promise.resolve({ id: commentId }) });

describe('POST /api/comments/[id]/reply（入队模式）', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.mocked(addReplyJob).mockResolvedValue({ id: 'job-1' } as never);
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeRequest('c1', { content: '你好' }), makeParams('c1'));
    expect(res.status).toBe(401);
  });

  it('参数非法时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const res = await POST(makeRequest('c1', { content: '' }), makeParams('c1'));
    expect(res.status).toBe(400);
  });

  it('评论不存在时返回 404', async () => {
    const user = await createUser();
    mockSession(user.id);
    const res = await POST(makeRequest('not-exist', { content: '感谢关注，欢迎交流' }), makeParams('not-exist'));
    expect(res.status).toBe(404);
  });

  it('无权操作他人评论时返回 403', async () => {
    const user = await createUser();
    const other = await createUser();
    const otherVideo = await createVideo(other.id);
    const otherComment = await createComment(otherVideo.id);
    mockSession(user.id);

    const res = await POST(
      makeRequest(otherComment.id, { content: '感谢关注，欢迎交流' }),
      makeParams(otherComment.id)
    );
    expect(res.status).toBe(403);
  });

  it('今日回复配额（SENT 口径）用完时返回 403', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    // FREE 每日回复上限 10 条，填满今日 SENT 记录
    for (let i = 0; i < 10; i++) {
      await prisma.reply.create({
        data: { content: `历史回复 ${i}`, status: 'SENT', sentAt: new Date(), commentId: comment.id },
      });
    }
    mockSession(user.id);

    const res = await POST(makeRequest(comment.id, { content: '感谢关注，欢迎交流' }), makeParams(comment.id));
    expect(res.status).toBe(403);
    expect(vi.mocked(addReplyJob)).not.toHaveBeenCalled();
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
    expect(vi.mocked(addReplyJob)).not.toHaveBeenCalled();
    expect(await prisma.reply.count({ where: { commentId: comment.id } })).toBe(0);
  });

  it('内容与近期已发话术雷同时同步返回 409，不入队', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    // 近期已发出过完全相同的内容
    await prisma.reply.create({
      data: { content: '感谢关注，欢迎交流', status: 'SENT', sentAt: new Date(), commentId: comment.id },
    });
    const otherComment = await createComment(video.id, { content: '另一条评论' });
    mockSession(user.id);

    const res = await POST(
      makeRequest(otherComment.id, { content: '感谢关注，欢迎交流' }),
      makeParams(otherComment.id)
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('CONTENT_TOO_SIMILAR');
    expect(vi.mocked(addReplyJob)).not.toHaveBeenCalled();
  });

  it('校验通过后创建 PENDING 回复并入队，返回 202', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    mockSession(user.id);

    const res = await POST(
      makeRequest(comment.id, { content: '感谢关注，欢迎交流' }),
      makeParams(comment.id)
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.queued).toBe(true);
    expect(json.reply.status).toBe('PENDING');

    // 落库 PENDING 行，入队参数指向该行
    const reply = await prisma.reply.findUnique({ where: { id: json.reply.id } });
    expect(reply?.status).toBe('PENDING');
    expect(reply?.content).toBe('感谢关注，欢迎交流');
    expect(vi.mocked(addReplyJob)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addReplyJob)).toHaveBeenCalledWith(comment.id, reply!.id);
    // 同步直发不再发生：评论状态保持原样，由 worker 发送后更新
    const after = await prisma.comment.findUnique({ where: { id: comment.id } });
    expect(after?.status).toBe('NEW');
  });

  it('种草模式：生成的内容落库 mode=seed 后入队', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    vi.mocked(generateSeedReply).mockResolvedValue('这个做法我也有同感，细节很到位');
    mockSession(user.id);

    const res = await POST(makeRequest(comment.id, { generate: true }), makeParams(comment.id));

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.queued).toBe(true);
    expect(json.reply.mode).toBe('seed');
    const reply = await prisma.reply.findUnique({ where: { id: json.reply.id } });
    expect(reply?.mode).toBe('seed');
    expect(vi.mocked(addReplyJob)).toHaveBeenCalledWith(comment.id, reply!.id);
  });

  it('入队失败时同步报错并把回复标记为 FAILED', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    vi.mocked(addReplyJob).mockRejectedValue(new Error('redis down'));
    mockSession(user.id);

    const res = await POST(
      makeRequest(comment.id, { content: '感谢关注，欢迎交流' }),
      makeParams(comment.id)
    );

    expect(res.status).toBe(503);
    const reply = await prisma.reply.findFirst({ where: { commentId: comment.id } });
    expect(reply?.status).toBe('FAILED');
  });
});
