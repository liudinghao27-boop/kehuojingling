/**
 * humanize 单元测试
 *
 * 用假 Locator/Page 断言调用序列与参数范围，不运行真实浏览器。
 */

import { vi, describe, it, expect, afterEach } from 'vitest';
import type { Locator, Page } from 'playwright';

// 让内部等待全部变成 no-op，测试不耗时
vi.mock('./utils', () => ({
  sleep: () => Promise.resolve(),
  randomDelay: () => Promise.resolve(),
}));

import { humanType, simulateHumanBrowsing } from './humanize';

function createFakeLocator() {
  const calls: string[] = [];
  const locator = {
    click: vi.fn(() => {
      calls.push('click');
      return Promise.resolve();
    }),
    pressSequentially: vi.fn<(text: string, options?: { delay?: number }) => Promise<void>>(
      (text) => {
        calls.push(`pressSequentially:${text}`);
        return Promise.resolve();
      }
    ),
    calls,
  };
  return locator;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('humanType', () => {
  it('先 click 聚焦，再逐字输入', async () => {
    const locator = createFakeLocator();
    await humanType(locator as unknown as Locator, '你好a');

    expect(locator.click).toHaveBeenCalledTimes(1);
    expect(locator.pressSequentially).toHaveBeenCalledTimes(3);
    // click 必须发生在第一次输入之前
    expect(locator.calls[0]).toBe('click');
    expect(locator.calls[1]).toBe('pressSequentially:你');
    expect(locator.calls[2]).toBe('pressSequentially:好');
    expect(locator.calls[3]).toBe('pressSequentially:a');
  });

  it('每个字符的输入间隔在 50-200ms 范围内', async () => {
    const locator = createFakeLocator();
    await humanType(locator as unknown as Locator, 'abcd');

    for (const call of locator.pressSequentially.mock.calls) {
      const options = call[1] as { delay?: number };
      expect(options.delay).toBeGreaterThanOrEqual(50);
      expect(options.delay).toBeLessThanOrEqual(200);
    }
  });

  it('空文本只聚焦不输入', async () => {
    const locator = createFakeLocator();
    await humanType(locator as unknown as Locator, '');

    expect(locator.click).toHaveBeenCalledTimes(1);
    expect(locator.pressSequentially).not.toHaveBeenCalled();
  });
});

describe('simulateHumanBrowsing', () => {
  function createFakePage() {
    return {
      mouse: {
        wheel: vi.fn<(dx: number, dy: number) => Promise<void>>(() => Promise.resolve()),
        move: vi.fn<(x: number, y: number, options?: { steps?: number }) => Promise<void>>(
          () => Promise.resolve()
        ),
      },
    };
  }

  it('滚动 2-5 次，每次 300-800px', async () => {
    const page = createFakePage();
    await simulateHumanBrowsing(page as unknown as Page);

    const wheelCalls = page.mouse.wheel.mock.calls;
    expect(wheelCalls.length).toBeGreaterThanOrEqual(2);
    expect(wheelCalls.length).toBeLessThanOrEqual(5);
    for (const [, dy] of wheelCalls) {
      expect(dy).toBeGreaterThanOrEqual(300);
      expect(dy).toBeLessThanOrEqual(800);
    }
  });

  it('鼠标移动 2-4 次，steps >= 10', async () => {
    const page = createFakePage();
    await simulateHumanBrowsing(page as unknown as Page);

    const moveCalls = page.mouse.move.mock.calls;
    expect(moveCalls.length).toBeGreaterThanOrEqual(2);
    expect(moveCalls.length).toBeLessThanOrEqual(4);
    for (const [, , options] of moveCalls) {
      expect((options as { steps?: number }).steps).toBeGreaterThanOrEqual(10);
    }
  });

  it('Math.random 取最小值时滚动/移动次数取下限', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const page = createFakePage();
    await simulateHumanBrowsing(page as unknown as Page);

    expect(page.mouse.wheel).toHaveBeenCalledTimes(2);
    expect(page.mouse.move).toHaveBeenCalledTimes(2);
  });
});
