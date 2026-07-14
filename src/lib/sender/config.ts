import { SenderProvider } from './types';
import { providers } from './providers';

export function getActiveProvider(platform: string): SenderProvider {
  // Step 4：抖音接入真实 Playwright provider，其他平台继续走 mock
  if (platform === 'DOUYIN') {
    return providers.douyin;
  }
  return providers.mock;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function hasProvider(_: string): boolean {
  // 与 getActiveProvider 保持一致，当前所有平台均返回支持
  return true;
}
