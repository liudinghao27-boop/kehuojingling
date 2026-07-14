import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from './route';
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

describe('/api/keywords/monitor', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('GET 未登录返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('GET 返回当前用户的监控关键词', async () => {
    const user = await createUser();
    await prisma.keywordMonitor.create({
      data: { userId: user.id, keyword: '英语培训', source: 'research-1' },
    });
    mockSession(user.id);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].keyword).toBe('英语培训');
  });

  it('POST 批量保存并去重', async () => {
    const user = await createUser();
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/keywords/monitor', {
      method: 'POST',
      body: JSON.stringify({ keywords: ['A', 'B', 'A'], source: 'research-1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(2);
    const monitors = await prisma.keywordMonitor.findMany({ where: { userId: user.id } });
    expect(monitors).toHaveLength(2);
  });

  it('POST 超出数量限制返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/keywords/monitor', {
      method: 'POST',
      body: JSON.stringify({ keywords: Array.from({ length: 101 }, (_, i) => `k${i}`) }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('DELETE 删除指定关键词', async () => {
    const user = await createUser();
    await prisma.keywordMonitor.create({ data: { userId: user.id, keyword: 'A' } });
    await prisma.keywordMonitor.create({ data: { userId: user.id, keyword: 'B' } });
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/keywords/monitor', {
      method: 'DELETE',
      body: JSON.stringify({ keywords: ['A'] }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const remaining = await prisma.keywordMonitor.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].keyword).toBe('B');
  });

  it('不会返回其他用户的监控词', async () => {
    const user1 = await createUser({ email: 'u1@test.com' });
    const user2 = await createUser({ email: 'u2@test.com' });
    await prisma.keywordMonitor.create({ data: { userId: user2.id, keyword: 'secret' } });
    mockSession(user1.id);
    const res = await GET();
    const json = await res.json();
    expect(json.items).toHaveLength(0);
  });
});
