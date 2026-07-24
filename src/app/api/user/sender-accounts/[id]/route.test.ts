import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from './route';
import { clearDatabase } from '@/lib/test/setup';
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

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/user/sender-accounts/[id]', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/user/sender-accounts/any');
    const res = await GET(req, params('any'));
    expect(res.status).toBe(401);
  });

  it('不能查看他人的账号', async () => {
    const user = await createUser();
    const other = await createUser();
    const account = await createSenderAccount(other.id);
    mockSession(user.id);

    const req = new NextRequest(`http://localhost:3000/api/user/sender-accounts/${account.id}`);
    const res = await GET(req, params(account.id));
    expect(res.status).toBe(404);
  });

  it('返回账号详情', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { label: '主号' });
    mockSession(user.id);

    const req = new NextRequest(`http://localhost:3000/api/user/sender-accounts/${account.id}`);
    const res = await GET(req, params(account.id));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.account.id).toBe(account.id);
    expect(body.account.label).toBe('主号');
  });
});

describe('PATCH /api/user/sender-accounts/[id]', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('更新账号信息', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id);
    mockSession(user.id);

    const req = new NextRequest(`http://localhost:3000/api/user/sender-accounts/${account.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label: '新名字', dailyLimit: 100 }),
    });
    const res = await PATCH(req, params(account.id));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.account.label).toBe('新名字');
    expect(body.account.dailyLimit).toBe(100);
  });

  it('冷却账号恢复 ACTIVE 时重置健康度', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, {
      status: 'COOLING',
      healthScore: 10,
      failCount: 5,
    });
    mockSession(user.id);

    const req = new NextRequest(`http://localhost:3000/api/user/sender-accounts/${account.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    const res = await PATCH(req, params(account.id));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.account.status).toBe('ACTIVE');
    expect(body.account.healthScore).toBe(50);
  });

  it('不能修改他人的账号', async () => {
    const user = await createUser();
    const other = await createUser();
    const account = await createSenderAccount(other.id);
    mockSession(user.id);

    const req = new NextRequest(`http://localhost:3000/api/user/sender-accounts/${account.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label: '劫持' }),
    });
    const res = await PATCH(req, params(account.id));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/user/sender-accounts/[id]', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('删除自己的账号', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id);
    mockSession(user.id);

    const req = new NextRequest(`http://localhost:3000/api/user/sender-accounts/${account.id}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, params(account.id));
    expect(res.status).toBe(200);

    const check = await GET(
      new NextRequest(`http://localhost:3000/api/user/sender-accounts/${account.id}`),
      params(account.id)
    );
    expect(check.status).toBe(404);
  });

  it('不能删除他人的账号', async () => {
    const user = await createUser();
    const other = await createUser();
    const account = await createSenderAccount(other.id);
    mockSession(user.id);

    const req = new NextRequest(`http://localhost:3000/api/user/sender-accounts/${account.id}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, params(account.id));
    expect(res.status).toBe(404);
  });
});
