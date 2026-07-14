import { Browser, Page } from 'playwright';

/**
 * 扫码登录会话状态
 */
export type QrLoginStatus =
  | 'pending'
  | 'scanned'
  | 'success'
  | 'expired'
  | 'error';

/**
 * 扫码登录会话
 *
 * 注意：Browser / Page / NodeJS.Timeout 仅在服务端使用，不会进入客户端 bundle。
 */
export interface QrLoginSession {
  sessionId: string;
  userId: string;
  platform: string;
  status: QrLoginStatus;
  qrCodeDataUrl?: string;
  error?: string;
  browser?: Browser;
  page?: Page;
  createdAt: number;
  timeout?: NodeJS.Timeout;
}
