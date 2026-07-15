import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { clearDatabase } from '@/lib/test/setup';
import { createUser, createKeywordMonitor } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';
import { scrapeAndSaveComments } from '@/lib/scraper';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

vi.mock('@/lib/scraper', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scraper')>('@/lib/scraper');
  return {
    ...actual,
    scrapeAndSaveComments: vi.fn(),
  };
});

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User', plan: 'FREE' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe('POST /api/videos/from-keyword', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.mocked(scrapeAndSaveComments).mockResolvedValue({
      success: true,
      commentsCount: 2,
      qualifiedCount: 2,
      noiseCount: 0,
      lowIntentCount: 0,
    });
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/videos/from-keyword', {
      method: 'POST',
      body: JSON.stringify({ keywordMonitorId: 'test', url: 'https://douyin.com/video/test', platform: 'DOUYIN' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('可以从监控关键词创建视频', async () => {
    const user = await createUser();
    const monitor = await createKeywordMonitor(user.id, { keyword: '玫瑰包装' });
    mockSession(user.id);

    const req = new NextRequest('http://localhost:3000/api/videos/from-keyword', {
      method: 'POST',
      body: JSON.stringify({
        keywordMonitorId: monitor.id,
        url: 'https://douyin.com/video/test',
        platform: 'DOUYIN',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.video.keywordMonitor).toMatchObject({ id: monitor.id, keyword: '玫瑰包装' });
  });

  it('不能访问其他用户的监控关键词', async () => {
    const user1 = await createUser({ email: 'u1@test.com' });
    const user2 = await createUser({ email: 'u2@test.com' });
    const monitor = await createKeywordMonitor(user2.id, { keyword: 'secret' });
    mockSession(user1.id);

    const req = new NextRequest('http://localhost:3000/api/videos/from-keyword', {
      method: 'POST',
      body: JSON.stringify({
        keywordMonitorId: monitor.id,
        url: 'https://douyin.com/video/test',
        platform: 'DOUYIN',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('无效链接返回 400', async () => {
    const user = await createUser();
    const monitor = await createKeywordMonitor(user.id, { keyword: '玫瑰包装' });
    mockSession(user.id);

    const req = new NextRequest('http://localhost:3000/api/videos/from-keyword', {
      method: 'POST',
      body: JSON.stringify({
        keywordMonitorId: monitor.id,
        url: 'not-a-valid-url',
        platform: 'DOUYIN',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
