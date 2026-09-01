import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { prisma, clearDatabase } from '@/lib/test/setup';
import { createUser } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';
import { researchWebPage } from '@/lib/ai/research';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

vi.mock('@/lib/ai/research', () => ({
  researchWebPage: vi.fn(),
}));

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User', plan: 'FREE' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/ai/research', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/research', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(buildRequest({ url: 'https://example.com/article' }));
    expect(res.status).toBe(401);
  });

  it('URL 无效时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const res = await POST(buildRequest({ url: 'not-a-url' }));
    expect(res.status).toBe(400);
  });

  it('研究成功后写入 aiResearchHistory（含 usedRealIndexData 字段）', async () => {
    const user = await createUser();
    mockSession(user.id);
    vi.mocked(researchWebPage).mockResolvedValue({
      hotTopics: ['话题1'],
      painPoints: ['痛点1'],
      competitorAccounts: ['竞品1'],
      keywords: ['关键词1'],
      summary: '网页总结',
    });
    const res = await POST(buildRequest({ url: 'https://example.com/article' }));
    expect(res.status).toBe(200);

    const history = await prisma.aiResearchHistory.findFirst({
      where: { userId: user.id },
    });
    expect(history).not.toBeNull();
    expect(history?.url).toBe('https://example.com/article');
    expect(history?.researchSummary).toBe('网页总结');
    expect(history?.researchHotTopics).toEqual(['话题1']);
    expect(history?.researchPainPoints).toEqual(['痛点1']);
    expect(history?.researchKeywords).toEqual(['关键词1']);
    expect(history?.usedRealIndexData).toBe(false);
  });

  it('超出每日额度时返回 403 且不再调用研究服务', async () => {
    const user = await createUser();
    // 预先创建 5 条历史记录占满 FREE 额度
    for (let i = 0; i < 5; i++) {
      await prisma.aiResearchHistory.create({
        data: {
          userId: user.id,
          title: `Research ${i}`,
          combinedSearchQueries: [],
          coreKeywords: [],
          longTailKeywords: [],
          painPoints: [],
          competitorAccounts: [],
        },
      });
    }
    mockSession(user.id);
    const res = await POST(buildRequest({ url: 'https://example.com/article' }));
    expect(res.status).toBe(403);
    expect(vi.mocked(researchWebPage)).not.toHaveBeenCalled();
  });
});
