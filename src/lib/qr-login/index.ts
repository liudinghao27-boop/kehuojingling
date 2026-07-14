import {
  createSession,
  getSession,
  scheduleCleanup,
} from './sessions';
import { startDouyinQrLogin } from './douyin';
import { QrLoginStatus } from './types';

export * from './types';
export { cleanupSession } from './sessions';

export async function startQrLogin(
  userId: string,
  platform: string
): Promise<{ sessionId: string; qrCodeDataUrl: string }> {
  const session = createSession(userId, platform);

  let qrCodeDataUrl: string;
  if (platform === 'DOUYIN') {
    qrCodeDataUrl = await startDouyinQrLogin(session);
  } else {
    throw new Error(`暂不支持该平台扫码登录：${platform}`);
  }

  session.qrCodeDataUrl = qrCodeDataUrl;
  scheduleCleanup(session.sessionId);

  return { sessionId: session.sessionId, qrCodeDataUrl };
}

export async function getQrLoginStatus(
  sessionId: string
): Promise<{
  status: QrLoginStatus;
  error?: string;
  platform?: string;
  qrCodeDataUrl?: string;
}> {
  const session = getSession(sessionId);
  if (!session) {
    return { status: 'expired', error: '会话已过期' };
  }

  return {
    status: session.status,
    error: session.error,
    platform: session.platform,
    qrCodeDataUrl: session.qrCodeDataUrl,
  };
}
