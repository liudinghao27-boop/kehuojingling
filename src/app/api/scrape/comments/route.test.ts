import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { prisma, clearDatabase } from '@/lib/test/setup';
import { createUser, createVideo, createComment } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';
import { parseVideoUrl, scrapeCommentsReal } from '@/lib/scraper/douyin';
import { analyzeComments } from '@/lib/ai/noise';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

vi.mock('@/lib/scraper/douyin', () => ({
  parseVideoUrl: vi.fn(),
  scrapeCommentsReal: vi.fn(),
}));

vi.mock('@/lib/ai/noise', () => ({
  analyzeComments: vi.fn(),
}));

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe('POST /api/scrape/comments', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/scrape/comments', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://douyin.com/video/test' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('请求体校验失败时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/scrape/comments', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('无法解析视频链接时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    vi.mocked(parseVideoUrl).mockReturnValue(null);
    const req = new NextRequest('http://localhost:3000/api/scrape/comments', {
      method: 'POST',
      body: JSON.stringify({ url: 'invalid' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('抓取成功时创建视频并保存高意向非噪音评论', async () => {
    const user = await createUser();
    mockSession(user.id);
    vi.mocked(parseVideoUrl).mockReturnValue({
      platform: 'DOUYIN',
      videoId: 'test123',
      originalUrl: 'https://douyin.com/video/test123',
    });
    vi.mocked(scrapeCommentsReal).mockResolvedValue([
      { id: 'c1', authorName: 'User1', content: 'I want to buy', createdAt: new Date().toISOString(), likes: 10 },
      { id: 'c2', authorName: 'User2', content: '666', createdAt: new Date().toISOString(), likes: 1 },
    ]);
    vi.mocked(analyzeComments).mockResolvedValue([
      {
        isNoise: false,
        noiseType: 'none',
        noiseReason: '',
        score: 5,
        keywords: ['buy'],
        category: 'purchase',
        reason: 'Strong',
      },
      {
        isNoise: true,
        noiseType: 'emotional',
        noiseReason: 'Pure emotion',
        score: 1,
        keywords: [],
        category: 'none',
        reason: '',
      },
    ]);
    const req = new NextRequest('http://localhost:3000/api/scrape/comments', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://douyin.com/video/test123' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.video.commentsCount).toBe(1);
    expect(json.video.highIntentCount).toBe(1);
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].content).toBe('I want to buy');

    const video = await prisma.video.findFirst({ where: { userId: user.id } });
    expect(video).not.toBeNull();
    expect(video?.platform).toBe('DOUYIN');
  });

  it('过滤低意向和噪音评论', async () => {
    const user = await createUser();
    mockSession(user.id);
    vi.mocked(parseVideoUrl).mockReturnValue({
      platform: 'DOUYIN',
      videoId: 'test123',
      originalUrl: 'https://douyin.com/video/test123',
    });
    vi.mocked(scrapeCommentsReal).mockResolvedValue([
      { id: 'c1', authorName: 'User1', content: 'Low intent', createdAt: new Date().toISOString(), likes: 0 },
    ]);
    vi.mocked(analyzeComments).mockResolvedValue([
      {
        isNoise: false,
        noiseType: 'none',
        noiseReason: '',
        score: 2,
        keywords: [],
        category: 'none',
        reason: 'Low',
      },
    ]);
    const req = new NextRequest('http://localhost:3000/api/scrape/comments', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://douyin.com/video/test123' }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.comments).toHaveLength(0);
  });

  it('视频数量达到套餐上限时返回 403', async () => {
    const user = await createUser();
    // 未设置 plan 时按 FREE 处理，最多 3 个视频
    for (let i = 0; i < 3; i++) {
      await createVideo(user.id, { url: `https://douyin.com/video/existing${i}` });
    }
    mockSession(user.id);
    vi.mocked(parseVideoUrl).mockReturnValue({
      platform: 'DOUYIN',
      videoId: 'new123',
      originalUrl: 'https://douyin.com/video/new123',
    });
    const req = new NextRequest('http://localhost:3000/api/scrape/comments', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://douyin.com/video/new123' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('同一用户重复添加相同链接时返回 409', async () => {
    const user = await createUser();
    await createVideo(user.id, { url: 'https://douyin.com/video/test123' });
    mockSession(user.id);
    vi.mocked(parseVideoUrl).mockReturnValue({
      platform: 'DOUYIN',
      videoId: 'test123',
      originalUrl: 'https://douyin.com/video/test123',
    });
    const req = new NextRequest('http://localhost:3000/api/scrape/comments', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://douyin.com/video/test123' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('该视频已添加');
  });

  it('其他用户已添加相同链接时不视为重复', async () => {
    const owner = await createUser();
    await createVideo(owner.id, { url: 'https://douyin.com/video/test123' });
    const user = await createUser();
    mockSession(user.id);
    vi.mocked(parseVideoUrl).mockReturnValue({
      platform: 'DOUYIN',
      videoId: 'test123',
      originalUrl: 'https://douyin.com/video/test123',
    });
    vi.mocked(scrapeCommentsReal).mockResolvedValue([]);
    vi.mocked(analyzeComments).mockResolvedValue([]);
    const req = new NextRequest('http://localhost:3000/api/scrape/comments', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://douyin.com/video/test123' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/scrape/comments', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/scrape/comments?videoId=123');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('缺少 videoId 时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/scrape/comments');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('不能读取他人视频的评论', async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const video = await createVideo(owner.id);
    await createComment(video.id, { content: 'Secret comment' });
    mockSession(attacker.id);
    const req = new NextRequest(`http://localhost:3000/api/scrape/comments?videoId=${video.id}`);
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('返回指定视频的评论', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id, { content: 'Hello', intentScore: 4 });
    mockSession(user.id);
    const req = new NextRequest(`http://localhost:3000/api/scrape/comments?videoId=${video.id}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].id).toBe(comment.id);
  });
});
