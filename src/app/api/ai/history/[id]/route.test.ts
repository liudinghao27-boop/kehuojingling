import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from './route';
import { prisma, clearDatabase } from '@/lib/test/setup';
import { createUser } from '@/lib/test/factories';
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

async function createHistory(userId: string, overrides: Partial<{ title: string; industry: string }> = {}) {
  return prisma.aiResearchHistory.create({
    data: {
      userId,
      title: overrides.title || 'Test Study',
      industry: overrides.industry || 'test',
      combinedSearchQueries: [],
      coreKeywords: [],
      longTailKeywords: [],
      painPoints: [],
      competitorAccounts: [],
    },
  });
}

describe('/api/ai/history/[id]', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('PATCH 更新标题、标签、收藏状态', async () => {
    const user = await createUser();
    const history = await createHistory(user.id);
    mockSession(user.id);
    const req = new NextRequest(`http://localhost:3000/api/ai/history/${history.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'New Title',
        tags: ['hot', 'training'],
        isFavorite: true,
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: history.id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.title).toBe('New Title');
    expect(json.item.tags).toEqual(['hot', 'training']);
    expect(json.item.isFavorite).toBe(true);
  });

  it('PATCH 不能更新其他用户的历史', async () => {
    const user1 = await createUser({ email: 'u1@test.com' });
    const user2 = await createUser({ email: 'u2@test.com' });
    const history = await createHistory(user2.id);
    mockSession(user1.id);
    const req = new NextRequest(`http://localhost:3000/api/ai/history/${history.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Hacked' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: history.id }) });
    expect(res.status).toBe(404);
  });

  it('GET 返回单条历史', async () => {
    const user = await createUser();
    const history = await createHistory(user.id, { title: 'Study' });
    mockSession(user.id);
    const res = await GET(new NextRequest(`http://localhost:3000/api/ai/history/${history.id}`), {
      params: Promise.resolve({ id: history.id }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.title).toBe('Study');
  });

  it('DELETE 删除历史', async () => {
    const user = await createUser();
    const history = await createHistory(user.id);
    mockSession(user.id);
    const res = await DELETE(new NextRequest(`http://localhost:3000/api/ai/history/${history.id}`), {
      params: Promise.resolve({ id: history.id }),
    });
    expect(res.status).toBe(200);
    const found = await prisma.aiResearchHistory.findUnique({ where: { id: history.id } });
    expect(found).toBeNull();
  });
});
