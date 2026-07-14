import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { clearDatabase } from '@/lib/test/setup';
import { createUser, createVideo, createComment } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe('GET /api/comments', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/comments');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('用户无评论时返回空列表与分页', async () => {
    const user = await createUser();
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/comments');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comments).toEqual([]);
    expect(json.pagination).toMatchObject({ total: 0, page: 1, pageSize: 10, totalPages: 0 });
  });

  it('返回当前用户的评论并携带分页信息', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id, { content: 'High intent', intentScore: 5 });
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/comments?page=1&pageSize=10');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe(comment.id);
    expect(json.pagination.total).toBe(1);
  });

  it('支持按 videoId 过滤', async () => {
    const user = await createUser();
    const video1 = await createVideo(user.id);
    const video2 = await createVideo(user.id, { url: 'https://douyin.com/video/test2' });
    await createComment(video1.id, { content: 'Comment 1' });
    const comment2 = await createComment(video2.id, { content: 'Comment 2' });
    mockSession(user.id);
    const req = new NextRequest(`http://localhost:3000/api/comments?videoId=${video2.id}`);
    const res = await GET(req);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe(comment2.id);
  });

  it('支持按 status 过滤', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    await createComment(video.id, { content: 'New', status: 'NEW' });
    const analyzed = await createComment(video.id, { content: 'Analyzed', status: 'ANALYZED' });
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/comments?status=ANALYZED');
    const res = await GET(req);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe(analyzed.id);
  });

  it('支持按高意向过滤', async () => {
    const user = await createUser({ intentScoreThreshold: 4 });
    const video = await createVideo(user.id);
    await createComment(video.id, { content: 'Low', intentScore: 2 });
    const high = await createComment(video.id, { content: 'High', intentScore: 5 });
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/comments?intent=high');
    const res = await GET(req);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe(high.id);
  });

  it('支持按 noise 过滤', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const noise = await createComment(video.id, { content: 'Noise', isNoise: true });
    await createComment(video.id, { content: 'Signal', isNoise: false });
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/comments?noise=true');
    const res = await GET(req);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe(noise.id);
  });

  it('默认只显示非噪音评论', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    await createComment(video.id, { content: 'Noise', isNoise: true });
    const signal = await createComment(video.id, { content: 'Signal', isNoise: false });
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/comments');
    const res = await GET(req);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe(signal.id);
  });

  it('支持按关键词搜索', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const match = await createComment(video.id, { content: 'unique keyword match' });
    await createComment(video.id, { content: 'other' });
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/comments?q=unique');
    const res = await GET(req);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe(match.id);
  });

  it('不会返回其他用户的评论', async () => {
    const user1 = await createUser({ email: 'user1@test.com' });
    const user2 = await createUser({ email: 'user2@test.com' });
    const video2 = await createVideo(user2.id);
    await createComment(video2.id, { content: 'Other user comment' });
    mockSession(user1.id);
    const req = new NextRequest('http://localhost:3000/api/comments');
    const res = await GET(req);
    const json = await res.json();
    expect(json.comments).toHaveLength(0);
  });
});
