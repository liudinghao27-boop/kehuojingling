import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase, prisma } from '@/lib/test/setup';
import { createUser, createSenderAccount } from '@/lib/test/factories';
import {
  pickAccount,
  claimAccountSlot,
  isAccountAvailable,
  isRiskControlError,
  handleSendFailure,
  handleSendSuccess,
  recoverAccount,
  recoverCoolingAccounts,
  createAccount,
  listAccounts,
  updateAccount,
  deleteAccount,
  checkContentCompliance,
  resetDailySentCounts,
} from './account-pool';

describe('isRiskControlError', () => {
  it('识别验证码类错误为风控', () => {
    expect(isRiskControlError('需要完成滑块验证码')).toBe(true);
    expect(isRiskControlError('登录已过期，请重新登录')).toBe(true);
    expect(isRiskControlError('操作过于频繁，请稍后再试')).toBe(true);
    expect(isRiskControlError('captcha required')).toBe(true);
  });

  it('普通错误不判定为风控', () => {
    expect(isRiskControlError('网络连接超时')).toBe(false);
    expect(isRiskControlError('元素未找到')).toBe(false);
  });
});

describe('checkContentCompliance', () => {
  it('合规内容直接通过', () => {
    const result = checkContentCompliance('感谢关注，欢迎交流花艺技巧');
    expect(result.compliant).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.sanitizedContent).toBeUndefined();
  });

  it('不合规内容返回问题列表和改写后的内容', () => {
    const result = checkContentCompliance('加我微信：abc123 免费领取资料');
    expect(result.compliant).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.sanitizedContent).toBeDefined();
    expect(result.sanitizedContent).not.toContain('abc123');
  });
});

describe('pickAccount', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('无账号时返回 null', async () => {
    const user = await createUser();
    const account = await pickAccount({ userId: user.id, platform: 'DOUYIN' });
    expect(account).toBeNull();
  });

  it('优先选择健康度高的账号', async () => {
    const user = await createUser();
    await createSenderAccount(user.id, { label: '低健康', healthScore: 50 });
    const high = await createSenderAccount(user.id, { label: '高健康', healthScore: 95 });

    const picked = await pickAccount({ userId: user.id, platform: 'DOUYIN' });
    expect(picked?.id).toBe(high.id);
  });

  it('跳过冷却中、健康度过低、额度已用完的账号', async () => {
    const user = await createUser();
    await createSenderAccount(user.id, { label: '冷却中', status: 'COOLING', healthScore: 100 });
    await createSenderAccount(user.id, { label: '低健康', healthScore: 20 });
    await createSenderAccount(user.id, { label: '额度用完', healthScore: 100, dailySent: 50, dailyLimit: 50 });

    const picked = await pickAccount({ userId: user.id, platform: 'DOUYIN' });
    expect(picked).toBeNull();
  });

  it('不会选中其他用户的账号', async () => {
    const userA = await createUser();
    const userB = await createUser();
    await createSenderAccount(userB.id, { label: 'B的账号' });

    const picked = await pickAccount({ userId: userA.id, platform: 'DOUYIN' });
    expect(picked).toBeNull();
  });

  it('支持排除指定账号', async () => {
    const user = await createUser();
    const a = await createSenderAccount(user.id, { label: 'A', healthScore: 100 });
    const b = await createSenderAccount(user.id, { label: 'B', healthScore: 90 });

    const picked = await pickAccount({
      userId: user.id,
      platform: 'DOUYIN',
      excludeAccountIds: [a.id],
    });
    expect(picked?.id).toBe(b.id);
  });

  it('选中账号时原子认领当日额度（dailySent +1）', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { dailySent: 3 });

    const picked = await pickAccount({ userId: user.id, platform: 'DOUYIN' });

    expect(picked?.id).toBe(account.id);
    const after = await prisma.senderAccount.findUnique({ where: { id: account.id } });
    expect(after?.dailySent).toBe(4);
  });

  it('额度只剩 1 时只能认领一次，再次挑选返回 null', async () => {
    const user = await createUser();
    await createSenderAccount(user.id, { dailySent: 49, dailyLimit: 50 });

    const first = await pickAccount({ userId: user.id, platform: 'DOUYIN' });
    expect(first).not.toBeNull();

    // 额度已被上一次认领占满，并发/重试场景下不能超发
    const second = await pickAccount({ userId: user.id, platform: 'DOUYIN' });
    expect(second).toBeNull();
  });
});

describe('claimAccountSlot', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('可用账号认领成功并扣减当日额度', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { dailySent: 10 });

    const claimed = await claimAccountSlot(account.id);

    expect(claimed?.id).toBe(account.id);
    expect(claimed?.dailySent).toBe(11);
  });

  it('冷却中或额度已满的账号认领失败返回 null', async () => {
    const user = await createUser();
    const cooling = await createSenderAccount(user.id, { label: '冷却', status: 'COOLING' });
    const exhausted = await createSenderAccount(user.id, { label: '超额', dailySent: 50, dailyLimit: 50 });

    expect(await claimAccountSlot(cooling.id)).toBeNull();
    expect(await claimAccountSlot(exhausted.id)).toBeNull();

    // 认领失败不应改动计数
    const after = await prisma.senderAccount.findUnique({ where: { id: exhausted.id } });
    expect(after?.dailySent).toBe(50);
  });
});

describe('isAccountAvailable', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('正常账号可用', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id);
    expect(await isAccountAvailable(account.id)).toBe(true);
  });

  it('冷却/低健康/超额账号不可用', async () => {
    const user = await createUser();
    const cooling = await createSenderAccount(user.id, { status: 'COOLING' });
    const lowHealth = await createSenderAccount(user.id, { healthScore: 10 });
    const exhausted = await createSenderAccount(user.id, { dailySent: 50, dailyLimit: 50 });

    expect(await isAccountAvailable(cooling.id)).toBe(false);
    expect(await isAccountAvailable(lowHealth.id)).toBe(false);
    expect(await isAccountAvailable(exhausted.id)).toBe(false);
  });

  it('不存在的账号返回 false', async () => {
    expect(await isAccountAvailable('not-exist')).toBe(false);
  });
});

describe('handleSendFailure', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('普通失败扣 5 分健康度', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { healthScore: 100 });

    const { account: updated, shouldCooling } = await handleSendFailure({
      accountId: account.id,
      error: '网络连接超时',
    });

    expect(updated.healthScore).toBe(95);
    expect(updated.failCount).toBe(1);
    expect(shouldCooling).toBe(false);
    expect(updated.status).toBe('ACTIVE');
  });

  it('风控失败扣 20 分健康度', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { healthScore: 100 });

    const { account: updated } = await handleSendFailure({
      accountId: account.id,
      error: '需要完成验证码验证',
    });

    expect(updated.healthScore).toBe(80);
  });

  it('连续失败 3 次触发冷却', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { healthScore: 100, failCount: 2 });

    const { account: updated, shouldCooling } = await handleSendFailure({
      accountId: account.id,
      error: '网络连接超时',
    });

    expect(shouldCooling).toBe(true);
    expect(updated.status).toBe('COOLING');
  });

  it('健康度低于 30 触发冷却', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { healthScore: 34 });

    const { account: updated, shouldCooling } = await handleSendFailure({
      accountId: account.id,
      error: '网络连接超时',
    });

    expect(shouldCooling).toBe(true);
    expect(updated.status).toBe('COOLING');
    expect(updated.healthScore).toBe(29);
  });

  it('风控扣分时健康度钳制到 0，不会变负数', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { healthScore: 10 });

    const { account: updated, shouldCooling } = await handleSendFailure({
      accountId: account.id,
      error: '需要完成验证码验证',
    });

    expect(updated.healthScore).toBe(0);
    expect(shouldCooling).toBe(true);
  });

  it('记录活动日志', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { label: '主号' });

    await handleSendFailure({ accountId: account.id, error: '验证码拦截' });

    const activity = await prisma.activity.findFirst({
      where: { userId: user.id, type: 'ERROR' },
    });
    expect(activity).not.toBeNull();
    expect(activity?.description).toContain('风控');
  });
});

describe('handleSendSuccess', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('成功回血 2 分并重置失败计数', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { healthScore: 90, failCount: 2, dailySent: 5 });

    const updated = await handleSendSuccess(account.id);

    expect(updated.healthScore).toBe(92);
    expect(updated.failCount).toBe(0);
    // dailySent 在 pickAccount/claimAccountSlot 原子认领时已扣减，成功回调不再重复计数
    expect(updated.dailySent).toBe(5);
    expect(updated.lastSuccessAt).not.toBeNull();
  });

  it('健康度不超过 100', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { healthScore: 100 });

    const updated = await handleSendSuccess(account.id);
    expect(updated.healthScore).toBe(100);
  });

  it('健康度 99 时回血被钳制到 100', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, { healthScore: 99 });

    const updated = await handleSendSuccess(account.id);
    expect(updated.healthScore).toBe(100);
  });
});

describe('账号恢复', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('recoverAccount 重置状态和健康度', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id, {
      status: 'COOLING',
      healthScore: 10,
      failCount: 5,
    });

    const recovered = await recoverAccount(account.id);
    expect(recovered.status).toBe('ACTIVE');
    expect(recovered.healthScore).toBe(50);
    expect(recovered.failCount).toBe(0);
  });

  it('recoverCoolingAccounts 只恢复冷却超过 2 小时的账号', async () => {
    const user = await createUser();
    // 3 小时前冷却 → 应恢复
    await createSenderAccount(user.id, {
      label: '可恢复',
      status: 'COOLING',
      lastFailAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    // 刚冷却 → 不恢复
    const recent = await createSenderAccount(user.id, {
      label: '刚冷却',
      status: 'COOLING',
      lastFailAt: new Date(),
    });

    const count = await recoverCoolingAccounts();
    expect(count).toBe(1);

    const stillCooling = await prisma.senderAccount.findUnique({ where: { id: recent.id } });
    expect(stillCooling?.status).toBe('COOLING');
  });
});

describe('账号 CRUD', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('创建账号并设置默认值', async () => {
    const user = await createUser();
    const account = await createAccount({
      userId: user.id,
      platform: 'DOUYIN',
      label: '主号',
      cookies: 'sessionid=abc',
    });

    expect(account.status).toBe('ACTIVE');
    expect(account.healthScore).toBe(100);
    expect(account.dailyLimit).toBe(50);
  });

  it('按用户和平台列出账号', async () => {
    const user = await createUser();
    const other = await createUser();
    await createSenderAccount(user.id, { label: '抖音号', platform: 'DOUYIN' });
    await createSenderAccount(user.id, { label: '快手号', platform: 'KUAISHOU' });
    await createSenderAccount(other.id, { label: '别人的号' });

    const all = await listAccounts(user.id);
    expect(all).toHaveLength(2);

    const douyinOnly = await listAccounts(user.id, 'DOUYIN');
    expect(douyinOnly).toHaveLength(1);
    expect(douyinOnly[0].label).toBe('抖音号');
  });

  it('更新账号信息', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id);

    const updated = await updateAccount(account.id, { label: '新名字', dailyLimit: 100 });
    expect(updated.label).toBe('新名字');
    expect(updated.dailyLimit).toBe(100);
  });

  it('删除账号', async () => {
    const user = await createUser();
    const account = await createSenderAccount(user.id);

    await deleteAccount(account.id);
    const found = await prisma.senderAccount.findUnique({ where: { id: account.id } });
    expect(found).toBeNull();
  });
});

describe('resetDailySentCounts', () => {
  it('重置所有账号的当日发送计数', async () => {
    await clearDatabase();
    const user = await createUser();
    await createSenderAccount(user.id, { dailySent: 30 });
    await createSenderAccount(user.id, { dailySent: 10 });

    const count = await resetDailySentCounts();
    expect(count).toBe(2);

    const accounts = await prisma.senderAccount.findMany({ where: { userId: user.id } });
    expect(accounts.every((a) => a.dailySent === 0)).toBe(true);
  });
});
