import { describe, expect, it } from 'vitest';
import {
  bigrams,
  findSimilarContent,
  jaccardSimilarity,
  normalizeContent,
  DEFAULT_SIMILARITY_THRESHOLD,
} from './dedup';

describe('normalizeContent', () => {
  it('去除标点、空白与 emoji，仅保留文字数字', () => {
    expect(normalizeContent('你好， 世界！！😀 vx: abc123')).toBe('你好世界vxabc123');
  });

  it('统一小写', () => {
    expect(normalizeContent('ABC Def')).toBe('abcdef');
  });
});

describe('bigrams', () => {
  it('生成二字元集合', () => {
    expect([...bigrams('获客精灵')]).toEqual(['获客', '客精', '精灵']);
  });

  it('空字符串返回空集合', () => {
    expect(bigrams('😀😀').size).toBe(0);
  });
});

describe('jaccardSimilarity', () => {
  it('完全相同 → 1', () => {
    expect(jaccardSimilarity('感兴趣的话可以私信我', '感兴趣的话可以私信我')).toBe(1);
  });

  it('模板套用（只改几个词）→ 高相似，超过阈值', () => {
    const a = '感谢您的信任！方便的话私信我一下，我把详细方案发给您~';
    const b = '感谢您的支持！方便的话私信我一下，我把详细报价发给您~';
    const score = jaccardSimilarity(a, b);
    expect(score).toBeGreaterThan(DEFAULT_SIMILARITY_THRESHOLD);
  });

  it('同义改写（换个说法）→ 低于阈值', () => {
    const a = '感谢您的信任！方便的话私信我一下，我把详细方案发给您~';
    const b = '这个问题我之前也踩过坑，后来换了个思路才跑通，可以聊聊';
    expect(jaccardSimilarity(a, b)).toBeLessThan(DEFAULT_SIMILARITY_THRESHOLD);
  });

  it('完全无关 → 接近 0', () => {
    expect(jaccardSimilarity('今天天气不错', '雅思课程多少钱')).toBeLessThan(0.1);
  });
});

describe('findSimilarContent', () => {
  const history = [
    '感谢您的信任！方便的话私信我一下，我把详细方案发给您~',
    '这个问题我们帮很多客户处理过，有具体需求可以私信沟通',
  ];

  it('检出与历史雷同的新话术', () => {
    const hit = findSimilarContent('感谢您的信任！方便的话私信我一下，我把详细资料发给您~', history);
    expect(hit.similar).toBe(true);
    expect(hit.matchedContent).toBe(history[0]);
  });

  it('全新表达不误报', () => {
    const hit = findSimilarContent('之前做餐饮选址也遇到过类似情况，关键是人流测算', history);
    expect(hit.similar).toBe(false);
    expect(hit.maxScore).toBeLessThan(DEFAULT_SIMILARITY_THRESHOLD);
  });

  it('空历史直接通过', () => {
    const hit = findSimilarContent('任意内容', []);
    expect(hit.similar).toBe(false);
    expect(hit.maxScore).toBe(0);
  });
});
