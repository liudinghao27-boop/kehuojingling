/**
 * 告警推送模块
 *
 * 支持钉钉 / 企业微信群机器人 Webhook，两者均为 markdown 消息格式。
 * 所有失败只 console.warn 不抛错——告警绝不能搞挂主流程。
 */

import { prisma } from '../db';

export type AlertChannelType = 'dingtalk' | 'wecom';

const FETCH_TIMEOUT_MS = 10_000;

/**
 * 向用户配置的告警渠道发送一条 markdown 消息。
 * 未启用 / 未配置 / 渠道不支持时直接返回 false；网络失败同样返回 false。
 */
export async function sendAlert(
  userId: string,
  title: string,
  content: string
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        alertEnabled: true,
        alertChannelType: true,
        alertWebhook: true,
      },
    });

    if (!user?.alertEnabled || !user.alertChannelType || !user.alertWebhook) {
      return false;
    }

    if (user.alertChannelType !== 'dingtalk' && user.alertChannelType !== 'wecom') {
      console.warn(`[alert] 不支持的告警渠道: ${user.alertChannelType}`);
      return false;
    }

    return await postWebhook(user.alertWebhook, title, content);
  } catch (error) {
    console.warn('[alert] 发送告警失败:', error);
    return false;
  }
}

/**
 * 直接向给定 webhook 发送 markdown 消息（测试告警等场景使用）。
 * 成功返回 true，失败返回 false（不抛错）。
 */
export async function postWebhook(
  webhook: string,
  title: string,
  content: string
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title, text: content },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[alert] webhook 返回非 2xx: ${res.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[alert] webhook 请求失败:', error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 消息模板
// ---------------------------------------------------------------------------

/** 账号触发冷却熔断时的告警内容 */
export function buildAccountCoolingAlert(
  label: string,
  platform: string,
  reason: string
): { title: string; content: string } {
  return {
    title: '发送账号触发冷却',
    content: [
      '### 发送账号触发冷却',
      '',
      `- **账号**：${label}`,
      `- **平台**：${platform}`,
      `- **原因**：${reason}`,
      `- **时间**：${new Date().toLocaleString('zh-CN')}`,
      '',
      '账号已进入冷却状态，将在 2 小时后自动恢复，也可手动提前恢复。',
    ].join('\n'),
  };
}

/** 测试告警内容 */
export function buildTestAlert(): { title: string; content: string } {
  return {
    title: '获客精灵告警测试',
    content: [
      '### 获客精灵告警测试',
      '',
      '这是一条测试消息，说明你的告警渠道配置正确。',
      '',
      `- **时间**：${new Date().toLocaleString('zh-CN')}`,
    ].join('\n'),
  };
}
