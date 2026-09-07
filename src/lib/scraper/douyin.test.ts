import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseVideoUrl, scrapeCommentsReal, getScraperApiUrl } from './douyin';

describe('parseVideoUrl', () => {
  it('解析抖音短链', () => {
    const result = parseVideoUrl('https://v.douyin.com/AbCdEfG/');
    expect(result).not.toBeNull();
    expect(result?.platform).toBe('DOUYIN');
    expect(result?.originalUrl).toBe('https://v.douyin.com/AbCdEfG/');
  });

  it('从分享文案中提取抖音链接', () => {
    const text = '7.48 复制打开抖音，看看【某某】的作品 https://v.douyin.com/AbCdEfG/ 123456';
    const result = parseVideoUrl(text);
    expect(result).not.toBeNull();
    expect(result?.platform).toBe('DOUYIN');
    expect(result?.originalUrl).toBe('https://v.douyin.com/AbCdEfG/');
  });

  it('解析抖音 video 链接', () => {
    const result = parseVideoUrl('https://www.douyin.com/video/123456?modeFrom=');
    expect(result).not.toBeNull();
    expect(result?.platform).toBe('DOUYIN');
    expect(result?.videoId).toBe('123456');
    expect(result?.originalUrl).toBe('https://www.douyin.com/video/123456');
  });

  it('解析快手链接', () => {
    const result = parseVideoUrl('https://www.kuaishou.com/short-video/abc123');
    expect(result).not.toBeNull();
    expect(result?.platform).toBe('KUAISHOU');
    expect(result?.videoId).toBe('abc123');
    expect(result?.originalUrl).toBe('https://www.kuaishou.com/short-video/abc123');
  });

  it('解析视频号链接', () => {
    const result = parseVideoUrl('https://channels.weixin.qq.com/web/pages/feed/detail?objectId=xyz');
    expect(result).not.toBeNull();
    expect(result?.platform).toBe('SHIPINHAO');
    expect(result?.originalUrl).toBe('https://channels.weixin.qq.com/web/pages/feed/detail?objectId=xyz');
  });

  it('无效输入返回 null', () => {
    expect(parseVideoUrl('not a url')).toBeNull();
  });
});

describe('getScraperApiUrl', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('未配置 SCRAPER_API_URL 时抛出配置指引错误', () => {
    vi.stubEnv('SCRAPER_API_URL', '');
    expect(() => getScraperApiUrl()).toThrow(/SCRAPER_API_URL/);
  });

  it('SCRAPER_API_URL 为 /api/scraper 时抛出配置指引错误（服务端自调代理必 401）', () => {
    vi.stubEnv('SCRAPER_API_URL', '/api/scraper');
    expect(() => getScraperApiUrl()).toThrow(/SCRAPER_API_URL/);
  });

  it('SCRAPER_API_URL 为 http:// 时直连', () => {
    vi.stubEnv('SCRAPER_API_URL', 'http://localhost:8000/');
    expect(getScraperApiUrl()).toBe('http://localhost:8000');
  });
});

describe('scrapeCommentsReal（自建爬虫路径，无 TIKHUB_API_KEY）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('TIKHUB_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('数字视频 ID 直取 aweme_id，跳过 hybrid，仅调用一次评论接口', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 })
    );

    const parsed = parseVideoUrl('https://www.douyin.com/video/123')!;
    await scrapeCommentsReal(parsed, 'http://localhost:3000/api/scraper');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const commentsUrl = mockFetch.mock.calls[0][0] as string;
    expect(commentsUrl).toContain('/api/scraper/douyin/web/fetch_video_comments?');
    expect(commentsUrl).toContain('aweme_id=123');
    expect(commentsUrl).not.toContain('/api/douyin/web/fetch_video_comments');
  });

  it('直连模式下请求路径包含 /api 前缀', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 })
    );

    const parsed = parseVideoUrl('https://www.douyin.com/video/123')!;
    await scrapeCommentsReal(parsed, 'http://localhost:8000');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const commentsUrl = mockFetch.mock.calls[0][0] as string;
    expect(commentsUrl).toContain('http://localhost:8000/api/douyin/web/fetch_video_comments?');
  });

  it('短链先本地 follow 重定向解析 aweme_id，再调评论接口', async () => {
    const mockFetch = vi.mocked(fetch);
    const redirectRes = new Response('', { status: 200 });
    Object.defineProperty(redirectRes, 'url', {
      value: 'https://www.douyin.com/video/7661929820783168811?previous_page=landing',
    });
    mockFetch
      .mockResolvedValueOnce(redirectRes)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 })
      );

    const parsed = parseVideoUrl('https://v.douyin.com/AbCdEfG/')!;
    await scrapeCommentsReal(parsed, 'http://localhost:8000');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('https://v.douyin.com/AbCdEfG/');
    const commentsUrl = mockFetch.mock.calls[1][0] as string;
    expect(commentsUrl).toContain('aweme_id=7661929820783168811');
  });

  it('短链重定向解析失败时回退 hybrid 接口解析', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { aweme_id: '456' } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 })
      );

    const parsed = parseVideoUrl('https://v.douyin.com/AbCdEfG/')!;
    await scrapeCommentsReal(parsed, 'http://localhost:8000');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][0] as string).toContain('/api/hybrid/video_data?');
    expect(mockFetch.mock.calls[2][0] as string).toContain('aweme_id=456');
  });

  it('请求携带超时信号', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 })
    );

    const parsed = parseVideoUrl('https://www.douyin.com/video/123')!;
    await scrapeCommentsReal(parsed, 'http://localhost:8000');

    for (const call of mockFetch.mock.calls) {
      const signal = (call[1] as RequestInit).signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
    }
  });

  it('抓取服务超时时抛出友好错误信息', async () => {
    const mockFetch = vi.mocked(fetch);
    const timeoutError = new Error('The operation timed out');
    timeoutError.name = 'TimeoutError';
    mockFetch.mockRejectedValue(timeoutError);

    const parsed = parseVideoUrl('https://www.douyin.com/video/123')!;
    await expect(scrapeCommentsReal(parsed, 'http://localhost:8000')).rejects.toThrow(/超时/);
  });

  it('未配置 SCRAPER_API_URL 且无 TikHub key 时抛出配置指引错误', async () => {
    vi.stubEnv('SCRAPER_API_URL', '');
    const parsed = parseVideoUrl('https://www.douyin.com/video/123')!;
    await expect(scrapeCommentsReal(parsed)).rejects.toThrow(/TIKHUB_API_KEY|SCRAPER_API_URL/);
  });
});

describe('scrapeCommentsReal（TikHub 主数据源）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('TIKHUB_API_KEY', 'test-tikhub-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const tikhubCommentsBody = {
    code: 200,
    data: {
      comments: [
        {
          cid: 'c1',
          text: '多少钱一辆？',
          digg_count: 5,
          create_time: 1788502555,
          user: { nickname: '路人甲', avatar_thumb: { url_list: ['https://p3.example.com/a.jpeg'] } },
        },
      ],
    },
  };

  it('数字视频 ID 直调 TikHub，Bearer 认证，无 hybrid 调用，字段正确映射', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(tikhubCommentsBody), { status: 200 })
    );

    const parsed = parseVideoUrl('https://www.douyin.com/video/1234567890123456789')!;
    const comments = await scrapeCommentsReal(parsed);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.tikhub.io/api/v1/douyin/web/fetch_video_comments?');
    expect(url).toContain('aweme_id=1234567890123456789');
    expect(url).toContain('cursor=0');
    expect(url).toContain('count=50');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-tikhub-key');

    expect(comments).toHaveLength(1);
    expect(comments[0].authorName).toBe('路人甲');
    expect(comments[0].content).toBe('多少钱一辆？');
    expect(comments[0].likes).toBe(5);
    expect(comments[0].createdAt).toBe(new Date(1788502555 * 1000).toISOString());
    expect(comments[0].authorAvatar).toBe('https://p3.example.com/a.jpeg');
  });

  it('短链先 follow 重定向解出 aweme_id 再调 TikHub', async () => {
    const mockFetch = vi.mocked(fetch);
    const redirectRes = new Response('', { status: 200 });
    Object.defineProperty(redirectRes, 'url', {
      value: 'https://www.douyin.com/video/7661929820783168811',
    });
    mockFetch
      .mockResolvedValueOnce(redirectRes)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(tikhubCommentsBody), { status: 200 })
      );

    const parsed = parseVideoUrl('https://v.douyin.com/AbCdEfG/')!;
    const comments = await scrapeCommentsReal(parsed);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('https://v.douyin.com/AbCdEfG/');
    expect(mockFetch.mock.calls[1][0] as string).toContain('aweme_id=7661929820783168811');
    expect(comments).toHaveLength(1);
  });

  it('TikHub 返回 HTTP 500 时 fallback 自建爬虫评论接口', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(new Response('upstream error', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { comments: [{ text: '自建', digg_count: 1, create_time: 1788502555, user: { nickname: '乙' } }] } }),
          { status: 200 }
        )
      );

    const parsed = parseVideoUrl('https://www.douyin.com/video/1234567890123456789')!;
    const comments = await scrapeCommentsReal(parsed, 'http://localhost:8000');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0] as string).toContain('http://localhost:8000/api/douyin/web/fetch_video_comments?');
    expect(comments[0].authorName).toBe('乙');
  });

  it('TikHub 返回 200 但 body code 非 200 时 fallback 自建爬虫', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 400, data: null }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 })
      );

    const parsed = parseVideoUrl('https://www.douyin.com/video/1234567890123456789')!;
    const comments = await scrapeCommentsReal(parsed, 'http://localhost:8000');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(comments).toEqual([]);
  });

  it('仅配置 TikHub（无 SCRAPER_API_URL）可正常工作', async () => {
    vi.stubEnv('SCRAPER_API_URL', '');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(tikhubCommentsBody), { status: 200 })
    );

    const parsed = parseVideoUrl('https://www.douyin.com/video/1234567890123456789')!;
    const comments = await scrapeCommentsReal(parsed);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(comments).toHaveLength(1);
  });

  it('TikHub 失败且未配置自建爬虫时抛出包含 TikHub 的错误', async () => {
    vi.stubEnv('SCRAPER_API_URL', '');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(new Response('upstream error', { status: 500 }));

    const parsed = parseVideoUrl('https://www.douyin.com/video/1234567890123456789')!;
    await expect(scrapeCommentsReal(parsed)).rejects.toThrow(/TikHub/);
  });
});
