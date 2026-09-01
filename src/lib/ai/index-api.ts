import { getErrorMessage } from '../errors';

export interface IndexDataPoint {
  keyword: string;
  searchVolume: number; // 1-5
  competition: number; // 1-5
  source: 'baidu' | 'douyin' | 'mock';
  confidence: number; // 0-1
}

export interface IndexProvider {
  name: string;
  fetch(keywords: string[]): Promise<IndexDataPoint[]>;
}

function normalizeScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

/**
 * 确定性 mock 指数提供者，用于测试与本地开发。
 * 根据关键词长度生成稳定的搜索量与竞争度，避免调用真实 API。
 */
export const mockIndexProvider: IndexProvider = {
  name: 'mock',
  async fetch(keywords: string[]): Promise<IndexDataPoint[]> {
    return keywords.map((keyword) => {
      const length = keyword.length || 1;
      // 长度 1-4 搜索量偏高，长度越长搜索量越低；竞争度与长度正相关
      const searchVolume = normalizeScore(6 - Math.min(length, 5) + ((length % 2) as number));
      const competition = normalizeScore(Math.min(length, 5));
      return {
        keyword,
        searchVolume,
        competition,
        source: 'mock',
        confidence: 0.5,
      };
    });
  },
};

async function callIndexApi(
  endpoint: string,
  keywords: string[],
  apiKey: string,
  source: 'baidu' | 'douyin'
): Promise<IndexDataPoint[]> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ keywords }),
      // 外部指数 API 不可控，限制 30s 超时避免长时间挂起
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      console.warn(`[${source}] Index API returned ${response.status}`);
      return [];
    }

    const data = (await response.json()) as unknown;
    // 占位符：真实接口契约未知，先按通用结构尝试解析
    const items = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown> | undefined)?.data)
        ? ((data as Record<string, unknown>).data as unknown[])
        : [];

    return items
      .map((item: unknown) => {
        const entry = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
        const keyword = typeof entry.keyword === 'string' ? entry.keyword : '';
        if (!keyword) return null;
        return {
          keyword,
          searchVolume: normalizeScore(Number(entry.searchVolume) || 3),
          competition: normalizeScore(Number(entry.competition) || 3),
          source,
          confidence: Math.max(0, Math.min(1, Number(entry.confidence) || 0.7)),
        };
      })
      .filter((item) => item !== null) as IndexDataPoint[];
  } catch (error) {
    if ((error as { name?: string })?.name === 'TimeoutError') {
      console.warn(`[${source}] Index API 请求超时（30s）`);
      return [];
    }
    console.warn(`[${source}] Index API call failed:`, getErrorMessage(error));
    return [];
  }
}

/**
 * 百度指数提供者占位实现。
 * 未配置 API Key 时直接返回空数组，不阻塞关键词评分流程。
 */
export const baiduIndexProvider: IndexProvider = {
  name: 'baidu',
  async fetch(keywords: string[]): Promise<IndexDataPoint[]> {
    const apiKey = process.env.BAIDU_INDEX_API_KEY;
    if (!apiKey) {
      console.warn('[baidu] BAIDU_INDEX_API_KEY not configured, skipping real index data');
      return [];
    }
    return callIndexApi('https://api.baidu.com/index/v1/keywords', keywords, apiKey, 'baidu');
  },
};

/**
 * 抖音热点宝提供者占位实现。
 * 未配置 API Key 时直接返回空数组，不阻塞关键词评分流程。
 */
export const douyinHotProvider: IndexProvider = {
  name: 'douyin',
  async fetch(keywords: string[]): Promise<IndexDataPoint[]> {
    const apiKey = process.env.DOUYIN_HOT_API_KEY;
    if (!apiKey) {
      console.warn('[douyin] DOUYIN_HOT_API_KEY not configured, skipping real index data');
      return [];
    }
    return callIndexApi('https://api.douyin.com/hotspot/v1/keywords', keywords, apiKey, 'douyin');
  },
};

/**
 * 按关键词合并多个提供者的指数数据。
 * 真实提供者（baidu/douyin）优先于 mock；多个真实结果按 confidence 加权平均。
 */
function mergeIndexResults(results: IndexDataPoint[]): Map<string, IndexDataPoint> {
  const byKeyword = new Map<string, IndexDataPoint[]>();
  for (const point of results) {
    const list = byKeyword.get(point.keyword) ?? [];
    list.push(point);
    byKeyword.set(point.keyword, list);
  }

  const merged = new Map<string, IndexDataPoint>();
  for (const [keyword, points] of byKeyword.entries()) {
    const real = points.filter((p) => p.source === 'baidu' || p.source === 'douyin');
    const mock = points.filter((p) => p.source === 'mock');
    const sourcePool = real.length > 0 ? real : mock;

    if (sourcePool.length === 0) continue;

    const totalConfidence = sourcePool.reduce((sum, p) => sum + p.confidence, 0);
    const searchVolume =
      totalConfidence > 0
        ? sourcePool.reduce((sum, p) => sum + p.searchVolume * p.confidence, 0) / totalConfidence
        : sourcePool[0].searchVolume;
    const competition =
      totalConfidence > 0
        ? sourcePool.reduce((sum, p) => sum + p.competition * p.confidence, 0) / totalConfidence
        : sourcePool[0].competition;

    const sources = new Set(sourcePool.map((p) => p.source));
    const source: IndexDataPoint['source'] =
      sources.size === 1 ? (Array.from(sources)[0] as IndexDataPoint['source']) : 'mock';

    merged.set(keyword, {
      keyword,
      searchVolume: normalizeScore(searchVolume),
      competition: normalizeScore(competition),
      source,
      confidence:
        totalConfidence > 0 ? Math.min(1, totalConfidence / sourcePool.length) : sourcePool[0].confidence,
    });
  }

  return merged;
}

/**
 * 创建组合指数提供者，并行调用多个底层提供者并合并结果。
 */
export function createCompositeIndexProvider(providers: IndexProvider[]): IndexProvider {
  return {
    name: providers.map((p) => p.name).join('+'),
    async fetch(keywords: string[]): Promise<IndexDataPoint[]> {
      const results = await Promise.all(providers.map((provider) => provider.fetch(keywords)));
      const merged = mergeIndexResults(results.flat());
      return Array.from(merged.values());
    },
  };
}

/**
 * 根据环境变量创建默认的指数提供者。
 * - ENABLE_REAL_INDEX_API=true 时启用百度/抖音真实 API（仍需配置对应 API Key）。
 * - 未启用或缺少 Key 时回退到 mock 提供者，保证本地开发与测试可用。
 */
export function createDefaultIndexProvider(): IndexProvider {
  const enableReal = process.env.ENABLE_REAL_INDEX_API === 'true';
  const providers: IndexProvider[] = [mockIndexProvider];
  if (enableReal) {
    providers.push(baiduIndexProvider, douyinHotProvider);
  }
  return createCompositeIndexProvider(providers);
}
