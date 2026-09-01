import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mockIndexProvider,
  baiduIndexProvider,
  douyinHotProvider,
  createCompositeIndexProvider,
  IndexProvider,
} from './index-api';

describe('mockIndexProvider', () => {
  it('returns deterministic data based on keyword length', async () => {
    const result = await mockIndexProvider.fetch(['短', '中等长度', '非常长的关键词']);
    expect(result).toHaveLength(3);
    expect(result[0].keyword).toBe('短');
    expect(result[0].source).toBe('mock');
    expect(result[0].confidence).toBe(0.5);
    expect(result[0].searchVolume).toBeGreaterThanOrEqual(1);
    expect(result[0].searchVolume).toBeLessThanOrEqual(5);
    expect(result[0].competition).toBeGreaterThanOrEqual(1);
    expect(result[0].competition).toBeLessThanOrEqual(5);
  });

  it('returns consistent results for the same keyword', async () => {
    const a = await mockIndexProvider.fetch(['测试关键词']);
    const b = await mockIndexProvider.fetch(['测试关键词']);
    expect(a).toEqual(b);
  });
});

describe('baiduIndexProvider', () => {
  beforeEach(() => {
    delete process.env.BAIDU_INDEX_API_KEY;
  });

  it('returns empty array and warns when API key is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await baiduIndexProvider.fetch(['关键词']);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BAIDU_INDEX_API_KEY'));
    warnSpy.mockRestore();
  });
});

describe('douyinHotProvider', () => {
  beforeEach(() => {
    delete process.env.DOUYIN_HOT_API_KEY;
  });

  it('returns empty array and warns when API key is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await douyinHotProvider.fetch(['关键词']);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DOUYIN_HOT_API_KEY'));
    warnSpy.mockRestore();
  });
});

describe('createCompositeIndexProvider', () => {
  it('merges results from multiple providers and prefers real sources', async () => {
    const real: IndexProvider = {
      name: 'real',
      async fetch(keywords) {
        return keywords.map((keyword) => ({
          keyword,
          searchVolume: 5,
          competition: 1,
          source: 'baidu' as const,
          confidence: 0.9,
        }));
      },
    };

    const composite = createCompositeIndexProvider([mockIndexProvider, real]);
    const result = await composite.fetch(['测试']);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      keyword: '测试',
      searchVolume: 5,
      competition: 1,
      source: 'baidu',
      confidence: 0.9,
    });
  });

  it('averages real results weighted by confidence', async () => {
    const baidu: IndexProvider = {
      name: 'baidu',
      async fetch(keywords) {
        return keywords.map((keyword) => ({
          keyword,
          searchVolume: 5,
          competition: 1,
          source: 'baidu' as const,
          confidence: 0.5,
        }));
      },
    };

    const douyin: IndexProvider = {
      name: 'douyin',
      async fetch(keywords) {
        return keywords.map((keyword) => ({
          keyword,
          searchVolume: 1,
          competition: 5,
          source: 'douyin' as const,
          confidence: 0.5,
        }));
      },
    };

    const composite = createCompositeIndexProvider([baidu, douyin]);
    const result = await composite.fetch(['测试']);

    expect(result).toHaveLength(1);
    expect(result[0].searchVolume).toBe(3);
    expect(result[0].competition).toBe(3);
    expect(result[0].source).toBe('mock');
  });

  it('falls back to mock when no real data is available', async () => {
    const composite = createCompositeIndexProvider([mockIndexProvider]);
    const result = await composite.fetch(['测试']);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('mock');
  });
});

describe('callIndexApi 超时控制', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('真实指数请求携带超时信号', async () => {
    vi.stubEnv('BAIDU_INDEX_API_KEY', 'test-key');
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await baiduIndexProvider.fetch(['关键词']);

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('请求超时时返回空数组并给出友好提示', async () => {
    vi.stubEnv('BAIDU_INDEX_API_KEY', 'test-key');
    const timeoutError = new Error('The operation timed out');
    timeoutError.name = 'TimeoutError';
    vi.mocked(fetch).mockRejectedValue(timeoutError);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await baiduIndexProvider.fetch(['关键词']);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('超时'));
    warnSpy.mockRestore();
  });
});
