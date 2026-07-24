import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { clearDatabase, prisma } from '@/lib/test/setup';
import { createUser, createSenderAccount } from '@/lib/test/factories';
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
    user: { id: userId, email: 'test@test.com', name: 'Test User', plan: 'FREE' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

function makeReq(action: string) {
  return new NextRequest('http://localhost:3000/api/user/sender-accounts/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

describe('POST /api/user/sender-accounts/bulk-status', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeReq('pause'));
    expect(res.status).toBe(401);
  });

  it('非法 action 返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const res = await POST(makeReq('delete'));
    expect(res.status).toBe(400);
  });

  it('pause 将所有 ACTIVE 账号置为 DISABLED，不影响其他状态和其他用户', async () => {
    const user = await createUser();
    const other = await createUser();
    const a1 = await createSenderAccount(user.id, { status: 'ACTIVE' });
    const a2 = await createSenderAccount(user.id, { status: 'ACTIVE' });
    const a3 = await createSenderAccount(user.id, { status: 'COOLING' });
    const otherAcc = await createSenderAccount(other.id, { status: 'ACTIVE' });
    mockSession(user.id);

    const res = await POST(makeReq('pause'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(2);

    const accounts = await prisma.senderAccount.findMany({ orderBy: { createdAt: 'asc' } });
    const byId = Object.fromEntries(accounts.map((a) => [a.id, a.status]));
    expect(byId[a1.id]).toBe('DISABLED');
    expect(byId[a2.id]).toBe('DISABLED');
    expect(byId[a3.id]).toBe('COOLING');
    expect(byId[otherAcc.id]).toBe('ACTIVE');
  });

  it('resume 将所有 DISABLED 账号置为 ACTIVE', async () => {
    const user = await createUser();
    await createSenderAccount(user.id, { status: 'DISABLED' });
    const cooling = await createSenderAccount(user.id, { status: 'COOLING' });
    mockSession(user.id);

    const res = await POST(makeReq('resume'));
    const body = await res.json();

    expect(body.updated).toBe(1);
    const coolingAfter = await prisma.senderAccount.findUnique({ where: { id: cooling.id } });
    expect(coolingAfter?.status).toBe('COOLING');
  });

  it('没有匹配账号时返回 updated: 0', async () => {
    const user = await createUser();
    mockSession(user.id);

    const res = await POST(makeReq('pause'));
    expect((await res.json()).updated).toBe(0);
  });
});
