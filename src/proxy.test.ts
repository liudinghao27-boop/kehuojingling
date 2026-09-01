import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { proxy, config } from './proxy';

vi.mock('next-auth/jwt', async () => {
  const actual = await vi.importActual<typeof import('next-auth/jwt')>('next-auth/jwt');
  return {
    ...actual,
    getToken: vi.fn(),
  };
});

describe('proxy 前端鉴权守卫', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('matcher 仅覆盖 /dashboard 及其子路径', () => {
    // /api、/login、/register、/ 等路径不匹配，不会进入 proxy
    expect(config.matcher).toEqual(['/dashboard/:path*']);
  });

  it('未登录访问 /dashboard 时 307 重定向到 /login 并携带 callbackUrl', async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await proxy(new NextRequest('http://localhost:3000/dashboard'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?callbackUrl=%2Fdashboard');
  });

  it('未登录访问子路径时 callbackUrl 为原始路径', async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await proxy(new NextRequest('http://localhost:3000/dashboard/videos'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?callbackUrl=%2Fdashboard%2Fvideos');
  });

  it('已登录时放行，不重定向', async () => {
    vi.mocked(getToken).mockResolvedValue({ id: 'user-1', email: 'test@test.com' });

    const res = await proxy(new NextRequest('http://localhost:3000/dashboard'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
