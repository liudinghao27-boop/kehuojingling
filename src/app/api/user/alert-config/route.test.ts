import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';
import { POST as TEST_POST } from './test/route';
import { clearDatabase, prisma } from '@/lib/test/setup';
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
    user: { id: userId, email: 'test@test.com', name: 'Test User', plan: 'FREE' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe('GET /api/user/alert-config', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeTruthy();
  });

  it('默认返回未启用、渠道和 webhook 为 null', async () => {
    const user = await createUser();
    mockSession(user.id);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config).toEqual({
      enabled: false,
      channelType: null,
      webhook: null,
    });
  });
});

describe('PATCH /api/user/alert-config', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/user/alert-config', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it('更新告警配置并返回最新配置', async () => {
    const user = await createUser();
    mockSession(user.id);

    const req = new NextRequest('http://localhost:3000/api/user/alert-config', {
      method: 'PATCH',
      body: JSON.stringify({
        enabled: true,
        channelType: 'dingtalk',
        webhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
      }),
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config).toEqual({
      enabled: true,
      channelType: 'dingtalk',
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
    });

    const saved = await prisma.user.findUnique({ where: { id: user.id } });
    expect(saved?.alertEnabled).toBe(true);
    expect(saved?.alertChannelType).toBe('dingtalk');
  });

  it('支持部分更新，未传字段保持不变', async () => {
    const user = await createUser();
    mockSession(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertEnabled: true,
        alertChannelType: 'wecom',
        alertWebhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/user/alert-config', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(body.config).toEqual({
      enabled: false,
      channelType: 'wecom',
      webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc',
    });
  });

  it('非法 channelType 返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);

    const req = new NextRequest('http://localhost:3000/api/user/alert-config', {
      method: 'PATCH',
      body: JSON.stringify({ channelType: 'slack' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/user/alert-config/test', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await TEST_POST();
    expect(res.status).toBe(401);
  });

  it('未配置告警时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);

    const res = await TEST_POST();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it('webhook 请求成功返回 success: true', async () => {
    const user = await createUser();
    mockSession(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertEnabled: true,
        alertChannelType: 'dingtalk',
        alertWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const res = await TEST_POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oapi.dingtalk.com/robot/send?access_token=abc');
    expect(JSON.parse(options.body).msgtype).toBe('markdown');
  });

  it('webhook 请求失败返回 502', async () => {
    const user = await createUser();
    mockSession(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertEnabled: true,
        alertChannelType: 'wecom',
        alertWebhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc',
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await TEST_POST();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBeTruthy();
  });
});
