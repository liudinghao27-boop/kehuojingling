/**
 * 平台消息发送器
 *
 * 当前通过 Provider 架构转发到具体平台实现。
 * Step 1 仅接入 mock provider，Step 4 将接入真实抖音 provider。
 */

import { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import {
  SendResult,
  SendReplyParams,
  SendDmParams,
  PlatformCredentials,
} from './types';
import { getActiveProvider, hasProvider } from './config';

export type { SendResult };

async function fetchCredentials(
  userId: string,
  platform: string
): Promise<{ success: false; error: string } | { success: true; credentials: PlatformCredentials }> {
  const credential = await prisma.platformCredential.findUnique({
    where: {
      userId_platform: {
        userId,
        platform: platform as Platform,
      },
    },
  });

  if (!credential) {
    return {
      success: false,
      error: `未配置 ${platform} 账号 Cookie，请先到设置页配置`,
    };
  }

  const cookies = decrypt(credential.cookies);
  return { success: true, credentials: { cookies } };
}

export async function sendReplyToPlatform(
  params: SendReplyParams
): Promise<SendResult> {
  const { userId, platform } = params;

  if (!hasProvider(platform)) {
    return { success: false, error: `暂不支持该平台：${platform}` };
  }

  const credentialResult = await fetchCredentials(userId, platform);
  if (!credentialResult.success) {
    return credentialResult;
  }

  const provider = getActiveProvider(platform);
  console.log('[Sender:reply]', params);
  const result = await provider.sendReply({
    ...params,
    credentials: credentialResult.credentials,
  });
  if (!result.success) {
    console.error('[Sender:reply] failed:', result.error);
  }
  return result;
}

export async function sendDmToPlatform(
  params: SendDmParams
): Promise<SendResult> {
  const { userId, platform } = params;

  if (!hasProvider(platform)) {
    return { success: false, error: `暂不支持该平台：${platform}` };
  }

  const credentialResult = await fetchCredentials(userId, platform);
  if (!credentialResult.success) {
    return credentialResult;
  }

  const provider = getActiveProvider(platform);
  console.log('[Sender:dm]', params);
  const result = await provider.sendDm({
    ...params,
    credentials: credentialResult.credentials,
  });
  if (!result.success) {
    console.error('[Sender:dm] failed:', result.error);
  }
  return result;
}
