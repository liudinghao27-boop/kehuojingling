import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeResult, mockIndexProvider, IndexProvider } from './keywords';

const mockAiResponse = {
  combinedSearchQueries: ['q1'],
  coreKeywords: ['k1'],
  longTailKeywords: ['long1'],
  painPoints: ['p1'],
  competitorAccounts: ['c1'],
  searchCommands: {
    douyin: ['d1'],
    xiaohongshu: [],
    zhihu: [],
    baidu: [],
  },
  scoredKeywords: [
    { keyword: 'k1', searchVolume: 3, competition: 2, businessIntent: 5, score: 4 },
    { keyword: 'long1', searchVolume: 4, competition: 3, businessIntent: 4, score: 3 },
  ],
};

vi.mock('./client', () => ({
  createAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          model: 'deepseek-v4-flash',
          choices: [{ message: { content: JSON.stringify(mockAiResponse) } }],
          usage: { total_tokens: 100 },
        }),
      },
    },
  })),
  getAIModel: vi.fn(() => 'deepseek-v4-flash'),
  hasAIKeyConfigured: vi.fn(() => true),
}));

describe('normalizeResult', () => {
  it('returns default structure for empty input', () => {
    const result = normalizeResult({});
    expect(result.combinedSearchQueries).toEqual([]);
    expect(result.coreKeywords).toEqual([]);
    expect(result.longTailKeywords).toEqual([]);
    expect(result.painPoints).toEqual([]);
    expect(result.competitorAccounts).toEqual([]);
    expect(result.searchCommands).toEqual({
      douyin: [],
      xiaohongshu: [],
      zhihu: [],
      baidu: [],
    });
    expect(result.scoredKeywords).toEqual([]);
  });

  it('normalizes string arrays and search commands', () => {
    const result = normalizeResult({
      combinedSearchQueries: ['q1', 'q2'],
      coreKeywords: ['k1'],
      searchCommands: {
        douyin: ['d1'],
        xiaohongshu: ['x1'],
        zhihu: ['z1'],
        baidu: ['b1'],
      },
    });
    expect(result.combinedSearchQueries).toEqual(['q1', 'q2']);
    expect(result.coreKeywords).toEqual(['k1']);
    expect(result.searchCommands.douyin).toEqual(['d1']);
  });

  it('normalizes scored keywords and clamps scores to 1-5', () => {
    const result = normalizeResult({
      scoredKeywords: [
        { keyword: 'valid', searchVolume: 3, competition: 2, businessIntent: 5, score: 4 },
        { keyword: 'out-of-range', searchVolume: 10, competition: -1, businessIntent: 0, score: 100 },
        { keyword: '', searchVolume: 2, competition: 2, businessIntent: 2, score: 2 },
        { keyword: 'missing-scores', searchVolume: 'not-a-number' },
      ],
    });
    expect(result.scoredKeywords).toHaveLength(3);
    expect(result.scoredKeywords[0]).toMatchObject({
      keyword: 'valid',
      searchVolume: 3,
      competition: 2,
      businessIntent: 5,
      score: 4,
    });
    expect(result.scoredKeywords[1]).toMatchObject({
      keyword: 'out-of-range',
      searchVolume: 5,
      competition: 1,
      businessIntent: 1,
      score: 5,
    });
    expect(result.scoredKeywords[2]).toMatchObject({
      keyword: 'missing-scores',
      searchVolume: 1,
      competition: 1,
      businessIntent: 1,
    });
  });

  it('calculates score when missing', () => {
    const result = normalizeResult({
      scoredKeywords: [
        { keyword: 'auto-score', searchVolume: 5, competition: 1, businessIntent: 5 },
      ],
    });
    expect(result.scoredKeywords[0].score).toBeGreaterThanOrEqual(1);
    expect(result.scoredKeywords[0].score).toBeLessThanOrEqual(5);
  });
});

describe('extractKeywordsWithAI with index provider', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('merges mock index data and sets source/confidence', async () => {
    const { extractKeywordsWithAI } = await import('./keywords');
    const result = await extractKeywordsWithAI('测试行业', 'fake-key', mockIndexProvider);

    expect(result.scoredKeywords).toHaveLength(2);
    for (const item of result.scoredKeywords) {
      expect(item.source).toBe('mock');
      expect(item.confidence).toBe(0.5);
    }
    expect(result.indexData).toBeDefined();
    expect(result.indexData).toHaveLength(2);
  });

  it('marks source as ai when no index data matches', async () => {
    const emptyProvider: IndexProvider = {
      name: 'empty',
      async fetch() {
        return [];
      },
    };

    const { extractKeywordsWithAI } = await import('./keywords');
    const result = await extractKeywordsWithAI('测试行业', 'fake-key', emptyProvider);

    expect(result.scoredKeywords[0].source).toBe('ai');
    expect(result.scoredKeywords[0].confidence).toBeUndefined();
  });

  it('uses real index data over LLM estimates', async () => {
    const realProvider: IndexProvider = {
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

    const { extractKeywordsWithAI } = await import('./keywords');
    const result = await extractKeywordsWithAI('测试行业', 'fake-key', realProvider);

    expect(result.scoredKeywords[0]).toMatchObject({
      searchVolume: 5,
      competition: 1,
      source: 'mixed',
      confidence: 0.9,
    });
  });
});
