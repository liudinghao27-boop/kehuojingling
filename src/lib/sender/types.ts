/**
 * 发送器类型定义
 */

export interface SendResult {
  success: boolean;
  error?: string;
  platformMessageId?: string;
}

export interface SendReplyParams {
  userId: string;
  platform: string;
  videoUrl: string;
  commentId: string;
  authorName: string;
  commentContent: string;
  content: string;
  credentials?: PlatformCredentials;
}

export interface SendDmParams {
  userId: string;
  platform: string;
  videoUrl: string;
  commentId: string;
  authorName: string;
  commentContent: string;
  content: string;
  credentials?: PlatformCredentials;
}

export type PlatformCredentials = Record<string, string>;

export interface SenderProvider {
  sendReply(params: SendReplyParams): Promise<SendResult>;
  sendDm(params: SendDmParams): Promise<SendResult>;
  validateCredentials(
    credentials: PlatformCredentials
  ): Promise<{ valid: boolean; error?: string }>;
}
