import { describe, it, expect } from 'vitest';
import { extractMatchedKeywords } from './index';

describe('extractMatchedKeywords', () => {
  it('忽略大小写匹配关键词', () => {
    const result = extractMatchedKeywords('我想学习玫瑰包装技巧', ['玫瑰包装']);
    expect(result).toEqual(['玫瑰包装']);
  });

  it('返回多个命中的关键词', () => {
    const result = extractMatchedKeywords('玫瑰包装和花艺培训都很感兴趣', ['玫瑰包装', '花艺培训']);
    expect(result).toContain('玫瑰包装');
    expect(result).toContain('花艺培训');
  });

  it('没有命中时返回空数组', () => {
    const result = extractMatchedKeywords('这是一条普通评论', ['玫瑰包装', '花艺培训']);
    expect(result).toEqual([]);
  });

  it('去重相同关键词', () => {
    const result = extractMatchedKeywords('玫瑰包装玫瑰包装', ['玫瑰包装']);
    expect(result).toEqual(['玫瑰包装']);
  });
});
