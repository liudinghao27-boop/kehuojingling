import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { clearDatabase } from '@/lib/test/setup';
import { createUser } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';
import { extractKeywordsWithAI } from '@/lib/ai/keywords';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

vi.mock('@/lib/ai/keywords', () => ({
  extractKeywordsWithAI: vi.fn(),
  createDefaultIndexProvider: vi.fn(() => ({ name: 'mock', fetch: vi.fn() })),
}));

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User', plan: 'FREE' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe('POST /api/ai/keywords', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/ai/keywords', {
      method: 'POST',
      body: JSON.stringify({ industry: 'test' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('缺少行业描述时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/ai/keywords', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('返回带评分的关键词结果', async () => {
    const user = await createUser();
    mockSession(user.id);
    vi.mocked(extractKeywordsWithAI).mockResolvedValue({
      combinedSearchQueries: ['q1'],
      coreKeywords: ['k1'],
      longTailKeywords: ['long1'],
      painPoints: ['p1'],
      competitorAccounts: ['c1'],
      searchCommands: { douyin: ['d1'], xiaohongshu: [], zhihu: [], baidu: [] },
      scoredKeywords: [
        { keyword: 'k1', searchVolume: 5, competition: 2, businessIntent: 5, score: 5 },
      ],
    });
    const req = new NextRequest('http://localhost:3000/api/ai/keywords', {
      method: 'POST',
      body: JSON.stringify({ industry: '英语培训' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.scoredKeywords).toHaveLength(1);
    expect(json.data.scoredKeywords[0]).toMatchObject({
      keyword: 'k1',
      score: 5,
    });
  });

  it('保存研究历史并记录指数数据', async () => {
    const user = await createUser();
    mockSession(user.id);
    vi.mocked(extractKeywordsWithAI).mockResolvedValue({
      combinedSearchQueries: ['q1'],
      coreKeywords: ['k1'],
      longTailKeywords: ['long1'],
      painPoints: ['p1'],
      competitorAccounts: ['c1'],
      searchCommands: { douyin: ['d1'], xiaohongshu: [], zhihu: [], baidu: [] },
      scoredKeywords: [
        { keyword: 'k1', searchVolume: 5, competition: 2, businessIntent: 5, score: 5, source: 'mixed', confidence: 0.9 },
      ],
      indexData: [{ keyword: 'k1', searchVolume: 5, competition: 2, source: 'baidu', confidence: 0.9 }],
    });
    const req = new NextRequest('http://localhost:3000/api/ai/keywords', {
      method: 'POST',
      body: JSON.stringify({ industry: '英语培训' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const { prisma } = await import('@/lib/test/setup');
    const history = await prisma.aiResearchHistory.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(history).not.toBeNull();
    expect(history?.industry).toBe('英语培训');
    expect(history?.usedRealIndexData).toBe(true);
    expect((history?.indexData as unknown[] | null)?.length).toBe(1);
  });

  it('超出每日额度时返回 403', async () => {
    const user = await createUser();
    // 预先创建 5 条历史记录占满 FREE 额度
    const { prisma } = await import('@/lib/test/setup');
    for (let i = 0; i < 5; i++) {
      await prisma.aiResearchHistory.create({
        data: {
          userId: user.id,
          title: `Study ${i}`,
          industry: 'test',
          combinedSearchQueries: [],
          coreKeywords: [],
          longTailKeywords: [],
          painPoints: [],
          competitorAccounts: [],
        },
      });
    }
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/ai/keywords', {
      method: 'POST',
      body: JSON.stringify({ industry: '英语培训' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
