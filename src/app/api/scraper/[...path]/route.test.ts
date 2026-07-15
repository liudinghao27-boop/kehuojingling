import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { getServerSession } from 'next-auth';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

function mockSession(userId = 'user-1') {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

function mockNoSession() {
  vi.mocked(getServerSession).mockResolvedValue(null);
}

describe('/api/scraper/[...path]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('SCRAPER_API_URL', 'http://localhost:8000');
  });

  it('未登录时返回 401', async () => {
    mockNoSession();
    const req = new NextRequest('http://localhost:3000/api/scraper/hybrid/video_data?url=test');
    const res = await GET(req, { params: Promise.resolve({ path: ['hybrid', 'video_data'] }) });
    expect(res.status).toBe(401);
  });

  it('GET 请求正确转发到抓取服务并透传响应', async () => {
    mockSession();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { aweme_id: '123' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const req = new NextRequest(
      'http://localhost:3000/api/scraper/hybrid/video_data?url=https%3A%2F%2Fdouyin.com%2Fvideo%2F123'
    );
    const res = await GET(req, { params: Promise.resolve({ path: ['hybrid', 'video_data'] }) });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe(
      'http://localhost:8000/hybrid/video_data?url=https%3A%2F%2Fdouyin.com%2Fvideo%2F123'
    );

    const json = await res.json();
    expect(json.data.aweme_id).toBe('123');
  });

  it('POST 请求透传 body 到抓取服务', async () => {
    mockSession();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const req = new NextRequest('http://localhost:3000/api/scraper/douyin/web/foo', {
      method: 'POST',
      body: JSON.stringify({ aweme_id: '123' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ path: ['douyin', 'web', 'foo'] }) });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe('http://localhost:8000/douyin/web/foo');

    const init = mockFetch.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(ArrayBuffer);
  });

  it('抓取服务返回 500 时透传错误状态码与响应体', async () => {
    mockSession();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'upstream error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const req = new NextRequest('http://localhost:3000/api/scraper/hybrid/video_data?url=test');
    const res = await GET(req, { params: Promise.resolve({ path: ['hybrid', 'video_data'] }) });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('upstream error');
  });

  it('抓取服务不可达时返回 502', async () => {
    mockSession();
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const req = new NextRequest('http://localhost:3000/api/scraper/hybrid/video_data?url=test');
    const res = await GET(req, { params: Promise.resolve({ path: ['hybrid', 'video_data'] }) });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('抓取服务暂不可用');
  });
});
