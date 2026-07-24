/**
 * UA 池 + 基础指纹伪装
 *
 * 目标用户在国内、使用中文 Windows 桌面浏览器，
 * 因此 UA 池只放近期 Chrome/Edge Windows 桌面 UA，
 * 配合 zh-CN locale、Asia/Shanghai 时区与小幅随机 viewport，
 * 避免「 headless 默认 UA + 英文环境 + 固定 1280x800」这种典型脚本指纹。
 */

import type { BrowserContext } from 'playwright';

/**
 * 近期 Chrome/Edge Windows 桌面 UA（真实格式，主版本 120+）。
 * 保持 8-12 个，定期跟随 Chrome 稳定版更新。
 */
export const USER_AGENT_POOL: readonly string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
];

export function getRandomUserAgent(): string {
  const index = Math.floor(Math.random() * USER_AGENT_POOL.length);
  return USER_AGENT_POOL[index];
}

/**
 * 在 1280x800 基准附近小幅随机，避免所有会话使用完全相同的分辨率。
 */
export function getRandomViewport(): { width: number; height: number } {
  const width = Math.floor(Math.random() * (1440 - 1200 + 1)) + 1200;
  const height = Math.floor(Math.random() * (900 - 720 + 1)) + 720;
  return { width, height };
}

/**
 * 在 context 上注入基础反检测脚本（每个新页面加载前执行）。
 * 保持精简，只覆盖最常见的自动化检测点。
 */
export async function applyStealthScripts(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // WHY: Playwright 默认 navigator.webdriver === true，是最常见的脚本特征
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // WHY: 真实 Chrome 存在 window.chrome 对象，缺失会被判定为非 Chrome 环境
    (window as unknown as { chrome: unknown }).chrome = { runtime: {} };

    // WHY: UA 伪装为中文浏览器后，languages 也要一致，否则 UA 与语言指纹矛盾
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });

    // WHY: headless Chrome 的 notifications 权限恒为 'denied'，
    // 与 Notification.permission（'default'）不一致是已知的 headless 检测点
    const permissions = navigator.permissions as unknown as {
      query?: (params: { name: string }) => Promise<unknown>;
    };
    const originalQuery = permissions.query?.bind(navigator.permissions);
    if (originalQuery) {
      permissions.query = (params: { name: string }): Promise<unknown> => {
        if (params.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery(params);
      };
    }
  });
}
