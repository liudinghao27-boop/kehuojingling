import { describe, it, expect } from 'vitest';
import { normalizeResult } from './keywords';

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
