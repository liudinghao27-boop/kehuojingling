import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
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

describe('GET /api/user/sender-accounts', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/user/sender-accounts');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('返回当前用户的账号列表', async () => {
    const user = await createUser();
    const other = await createUser();
    await createSenderAccount(user.id, { label: '主号' });
    await createSenderAccount(other.id, { label: '别人的号' });
    mockSession(user.id);

    const req = new NextRequest('http://localhost:3000/api/user/sender-accounts');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0].label).toBe('主号');
    // 不应泄露 cookies
    expect(body.accounts[0].cookies).toBeUndefined();
  });

  it('支持按平台过滤', async () => {
    const user = await createUser();
    await createSenderAccount(user.id, { label: '抖音号', platform: 'DOUYIN' });
    await createSenderAccount(user.id, { label: '快手号', platform: 'KUAISHOU' });
    mockSession(user.id);

    const req = new NextRequest('http://localhost:3000/api/user/sender-accounts?platform=KUAISHOU');
    const res = await GET(req);
    const body = await res.json();

    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0].platform).toBe('KUAISHOU');
  });
});

describe('POST /api/user/sender-accounts', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/user/sender-accounts', {
      method: 'POST',
      body: JSON.stringify({ label: '主号', cookies: 'sessionid=abc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('参数校验失败返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);

    const req = new NextRequest('http://localhost:3000/api/user/sender-accounts', {
      method: 'POST',
      body: JSON.stringify({ label: '', cookies: '' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('成功创建账号', async () => {
    const user = await createUser();
    mockSession(user.id);

    const req = new NextRequest('http://localhost:3000/api/user/sender-accounts', {
      method: 'POST',
      body: JSON.stringify({ label: '主号', cookies: 'sessionid=abc', dailyLimit: 30 }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.account.label).toBe('主号');
    expect(body.account.status).toBe('ACTIVE');
    expect(body.account.healthScore).toBe(100);
    expect(body.account.dailyLimit).toBe(30);
  });
});
