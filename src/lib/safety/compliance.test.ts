import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSafeSendTime, getNextSafeSendTime } from './compliance';

// 发送时间窗口语义：SAFE_HOURS = [10, 11, 15, 16, 17, 19, 20]，按北京时间（UTC+8，无夏令时）判定，
// 与服务器本地时区无关——云端容器为 UTC、开发机为 CST，两端行为必须一致。
// 注意：在本机（CST）跑旧代码不会暴露问题，需用 `TZ=UTC npx vitest run` 复现云端时区验证。

describe('发送时间窗口（北京时间语义，与服务器时区无关）', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('UTC 02:00 = 北京 10:00，在安全窗口内', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T02:00:00Z'));
    expect(isSafeSendTime()).toBe(true);
  });

  it('UTC 12:00 = 北京 20:00，在安全窗口内', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    expect(isSafeSendTime()).toBe(true);
  });

  it('UTC 06:30 = 北京 14:30，不在窗口；下一个窗口为北京 15 点（UTC 07 点）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T06:30:00Z'));
    expect(isSafeSendTime()).toBe(false);

    const next = getNextSafeSendTime();
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getUTCHours()).toBe(7); // 北京 15 点 = UTC 7 点
  });

  it('UTC 16:30 = 北京次日 00:30，跨天推到北京次日 10 点（UTC 02 点）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T16:30:00Z'));
    expect(isSafeSendTime()).toBe(false);

    const next = getNextSafeSendTime();
    expect(next.getUTCHours()).toBe(2); // 北京次日 10 点 = UTC 2 点
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });
});
