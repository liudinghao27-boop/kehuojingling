/**
 * 发送账号池管理
 *
 * 核心职责：
 * - 多账号 Cookie 存储与轮换
 * - 账号健康度评分（0-100）
 * - 失败熔断与自动恢复
 * - 按平台/用户隔离发送能力
 */

import { prisma } from '../db';
import { Platform, AccountStatus, SenderAccount } from '@prisma/client';
import { checkCompliance, generateCompliantVariant } from '../safety/compliance';
import { sendAlert, buildAccountCoolingAlert } from '../monitor/alert';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface PickAccountOptions {
  userId: string;
  platform: Platform;
  minHealthScore?: number;
  excludeAccountIds?: string[];
}

export interface SendFailureContext {
  accountId: string;
  error: string;
  isRiskControl?: boolean;
}

export interface AccountRecoverySchedule {
  accountId: string;
  delayMs: number;
}

// ---------------------------------------------------------------------------
// 账号选择
// ---------------------------------------------------------------------------

/**
 * 选择最优发送账号。
 * 策略：健康度 > 剩余额度 > 最久未使用。
 */
export async function pickAccount(options: PickAccountOptions): Promise<SenderAccount | null> {
  const {
    userId,
    platform,
    minHealthScore = 30,
    excludeAccountIds = [],
  } = options;

  const accounts = await prisma.senderAccount.findMany({
    where: {
      userId,
      platform,
      status: AccountStatus.ACTIVE,
      healthScore: { gte: minHealthScore },
      id: { notIn: excludeAccountIds },
      dailySent: { lt: prisma.senderAccount.fields.dailyLimit },
    },
    orderBy: [
      { healthScore: 'desc' },
      { lastSuccessAt: 'asc' },
      { dailySent: 'asc' },
    ],
    take: 1,
  });

  return accounts[0] ?? null;
}

/**
 * 检查账号是否可用。
 */
export async function isAccountAvailable(accountId: string): Promise<boolean> {
  const account = await prisma.senderAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) return false;
  if (account.status !== AccountStatus.ACTIVE) return false;
  if (account.healthScore < 30) return false;
  if (account.dailySent >= account.dailyLimit) return false;

  return true;
}

// ---------------------------------------------------------------------------
// 失败处理与熔断
// ---------------------------------------------------------------------------

/**
 * 判断错误是否属于平台风控。
 */
export function isRiskControlError(error: string): boolean {
  const patterns = [
    /验证码/,
    /验证/,
    /登录/,
    /封禁/,
    /限制/,
    /频繁/,
    /风险/,
    /安全/,
    /captcha/i,
    /verify/i,
    /login/i,
    /blocked/i,
    /risk/i,
  ];
  return patterns.some((p) => p.test(error));
}

/**
 * 处理发送失败，更新账号健康度，必要时触发熔断。
 */
export async function handleSendFailure(context: SendFailureContext): Promise<{
  account: SenderAccount;
  shouldCooling: boolean;
  recoveryDelayMs: number;
}> {
  const { accountId, error, isRiskControl = isRiskControlError(error) } = context;

  const account = await prisma.senderAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error(`账号不存在: ${accountId}`);
  }

  // 健康度扣分：风控 -20，普通失败 -5
  const scoreDelta = isRiskControl ? 20 : 5;
  const newScore = Math.max(0, account.healthScore - scoreDelta);
  const newFailCount = account.failCount + 1;

  // 熔断条件：连续失败 3 次，或健康度低于 30
  const shouldCooling = newFailCount >= 3 || newScore < 30;
  const recoveryDelayMs = 2 * 60 * 60 * 1000; // 2 小时

  const updated = await prisma.senderAccount.update({
    where: { id: accountId },
    data: {
      healthScore: newScore,
      failCount: newFailCount,
      lastFailAt: new Date(),
      status: shouldCooling ? AccountStatus.COOLING : AccountStatus.ACTIVE,
    },
  });

  // 记录活动日志
  await prisma.activity.create({
    data: {
      type: 'ERROR',
      description: `发送失败${isRiskControl ? '（风控）' : ''}: ${error}`,
      metadata: {
        accountId,
        accountLabel: account.label,
        platform: account.platform,
        healthScore: newScore,
        failCount: newFailCount,
        shouldCooling,
      },
      userId: account.userId,
    },
  });

  // 触发冷却时推送告警（sendAlert 内部已兜底，不会抛错）
  if (shouldCooling) {
    const alert = buildAccountCoolingAlert(
      account.label,
      account.platform,
      `连续失败 ${newFailCount} 次，健康度降至 ${newScore}（最近错误：${error}）`
    );
    await sendAlert(account.userId, alert.title, alert.content);
  }

  return { account: updated, shouldCooling, recoveryDelayMs };
}

/**
 * 处理发送成功，恢复账号健康度。
 */
export async function handleSendSuccess(accountId: string): Promise<SenderAccount> {
  const account = await prisma.senderAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error(`账号不存在: ${accountId}`);
  }

  // 成功回血 +2，上限 100
  const newScore = Math.min(100, account.healthScore + 2);

  return prisma.senderAccount.update({
    where: { id: accountId },
    data: {
      healthScore: newScore,
      failCount: 0,
      lastSuccessAt: new Date(),
      dailySent: { increment: 1 },
    },
  });
}

/**
 * 恢复冷却中的账号。
 */
export async function recoverAccount(accountId: string): Promise<SenderAccount> {
  return prisma.senderAccount.update({
    where: { id: accountId },
    data: {
      status: AccountStatus.ACTIVE,
      failCount: 0,
      healthScore: 50, // 恢复后健康度重置为 50，观察一段时间
    },
  });
}

/**
 * 批量恢复所有冷却中的账号（由定时任务调用）。
 */
export async function recoverCoolingAccounts(): Promise<number> {
  const result = await prisma.senderAccount.updateMany({
    where: {
      status: AccountStatus.COOLING,
      lastFailAt: {
        lt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 冷却超过 2 小时
      },
    },
    data: {
      status: AccountStatus.ACTIVE,
      failCount: 0,
      healthScore: 50,
    },
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// 账号 CRUD
// ---------------------------------------------------------------------------

export interface CreateAccountInput {
  userId: string;
  platform: Platform;
  label: string;
  cookies: string;
  proxyUrl?: string;
  dailyLimit?: number;
}

export async function createAccount(input: CreateAccountInput): Promise<SenderAccount> {
  // TODO: 加密 cookies（使用 PLATFORM_CREDENTIALS_ENCRYPTION_KEY）
  return prisma.senderAccount.create({
    data: {
      userId: input.userId,
      platform: input.platform,
      label: input.label,
      cookies: input.cookies,
      proxyUrl: input.proxyUrl,
      dailyLimit: input.dailyLimit ?? 50,
    },
  });
}

export async function listAccounts(userId: string, platform?: Platform): Promise<SenderAccount[]> {
  return prisma.senderAccount.findMany({
    where: {
      userId,
      ...(platform && { platform }),
    },
    orderBy: [
      { status: 'asc' },
      { healthScore: 'desc' },
      { createdAt: 'asc' },
    ],
  });
}

export async function updateAccount(
  accountId: string,
  data: Partial<Pick<SenderAccount, 'label' | 'cookies' | 'proxyUrl' | 'dailyLimit' | 'status'>>
): Promise<SenderAccount> {
  return prisma.senderAccount.update({
    where: { id: accountId },
    data,
  });
}

export async function deleteAccount(accountId: string): Promise<void> {
  await prisma.senderAccount.delete({
    where: { id: accountId },
  });
}

// ---------------------------------------------------------------------------
// 内容合规（发送前强制检查）
// ---------------------------------------------------------------------------

export interface ComplianceCheckResult {
  compliant: boolean;
  issues: string[];
  sanitizedContent?: string;
}

/**
 * 发送前内容合规检查。
 * 如果不合规，返回改写后的安全内容。
 */
export function checkContentCompliance(content: string): ComplianceCheckResult {
  const result = checkCompliance(content);

  if (result.compliant) {
    return { compliant: true, issues: [] };
  }

  // 自动改写为合规话术
  const sanitized = generateCompliantVariant(content);

  return {
    compliant: false,
    issues: result.issues,
    sanitizedContent: sanitized,
  };
}

// 合规变体生成统一由 safety/compliance 提供，这里仅 re-export 保持调用方不变
export { generateCompliantVariant };

// ---------------------------------------------------------------------------
// 日额度重置（由定时任务调用）
// ---------------------------------------------------------------------------

/**
 * 重置所有账号的当日发送计数。
 * 应在每日 0 点执行。
 */
export async function resetDailySentCounts(): Promise<number> {
  const result = await prisma.senderAccount.updateMany({
    data: { dailySent: 0 },
  });
  return result.count;
}
