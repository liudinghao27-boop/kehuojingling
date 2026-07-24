/**
 * UA 池单元测试
 */

import { vi, describe, it, expect, afterEach } from 'vitest';
import {
  USER_AGENT_POOL,
  getRandomUserAgent,
  getRandomViewport,
} from './ua-pool';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('USER_AGENT_POOL', () => {
  it('池内有 8-12 个 UA', () => {
    expect(USER_AGENT_POOL.length).toBeGreaterThanOrEqual(8);
    expect(USER_AGENT_POOL.length).toBeLessThanOrEqual(12);
  });

  it('全部是 Windows Chrome/Edge 真实格式 UA', () => {
    const pattern =
      /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/1\d{2}\.0\.0\.0 Safari\/537\.36( Edg\/1\d{2}\.0\.0\.0)?$/;
    for (const ua of USER_AGENT_POOL) {
      expect(ua).toMatch(pattern);
    }
  });
});

describe('getRandomUserAgent', () => {
  it('返回值一定是池内成员', () => {
    for (let i = 0; i < 50; i++) {
      expect(USER_AGENT_POOL).toContain(getRandomUserAgent());
    }
  });

  it('Math.random=0 时返回第一个，接近 1 时返回最后一个', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getRandomUserAgent()).toBe(USER_AGENT_POOL[0]);

    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(getRandomUserAgent()).toBe(
      USER_AGENT_POOL[USER_AGENT_POOL.length - 1]
    );
  });
});

describe('getRandomViewport', () => {
  it('尺寸在允许范围内', () => {
    for (let i = 0; i < 50; i++) {
      const viewport = getRandomViewport();
      expect(viewport.width).toBeGreaterThanOrEqual(1200);
      expect(viewport.width).toBeLessThanOrEqual(1440);
      expect(viewport.height).toBeGreaterThanOrEqual(720);
      expect(viewport.height).toBeLessThanOrEqual(900);
      expect(Number.isInteger(viewport.width)).toBe(true);
      expect(Number.isInteger(viewport.height)).toBe(true);
    }
  });

  it('Math.random=0 时取下限', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getRandomViewport()).toEqual({ width: 1200, height: 720 });
  });
});
