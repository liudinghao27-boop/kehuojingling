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

  it('SCRAPER_API_URL 为空时默认走代理', () => {
    vi.stubEnv('SCRAPER_API_URL', '');
    expect(getScraperApiUrl()).toBe('http://localhost:3000/api/scraper');
  });

  it('SCRAPER_API_URL 为 /api/scraper 时走代理', () => {
    vi.stubEnv('SCRAPER_API_URL', '/api/scraper');
    expect(getScraperApiUrl()).toBe('http://localhost:3000/api/scraper');
  });

  it('SCRAPER_API_URL 为 http:// 时直连', () => {
    vi.stubEnv('SCRAPER_API_URL', 'http://localhost:8000/');
    expect(getScraperApiUrl()).toBe('http://localhost:8000');
  });
});

describe('scrapeCommentsReal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('代理模式下请求路径不包含 /api 前缀', async () => {
    vi.stubEnv('SCRAPER_API_URL', '/api/scraper');
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { aweme_id: '123' } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 })
      );

    const parsed = parseVideoUrl('https://www.douyin.com/video/123')!;
    await scrapeCommentsReal(parsed);

    const hybridUrl = mockFetch.mock.calls[0][0] as string;
    const commentsUrl = mockFetch.mock.calls[1][0] as string;
    expect(hybridUrl).toContain('/api/scraper/hybrid/video_data?');
    expect(hybridUrl).not.toContain('/api/hybrid/video_data');
    expect(commentsUrl).toContain('/api/scraper/douyin/web/fetch_video_comments?');
    expect(commentsUrl).not.toContain('/api/douyin/web/fetch_video_comments');
  });

  it('直连模式下请求路径包含 /api 前缀', async () => {
    vi.stubEnv('SCRAPER_API_URL', 'http://localhost:8000');
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { aweme_id: '123' } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 })
      );

    const parsed = parseVideoUrl('https://www.douyin.com/video/123')!;
    await scrapeCommentsReal(parsed);

    const hybridUrl = mockFetch.mock.calls[0][0] as string;
    const commentsUrl = mockFetch.mock.calls[1][0] as string;
    expect(hybridUrl).toContain('http://localhost:8000/api/hybrid/video_data?');
    expect(commentsUrl).toContain('http://localhost:8000/api/douyin/web/fetch_video_comments?');
  });
});
