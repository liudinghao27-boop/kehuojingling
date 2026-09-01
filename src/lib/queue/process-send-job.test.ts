import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Bull from 'bull';
import { clearDatabase, prisma } from '@/lib/test/setup';
import {
  createUser,
  createVideo,
  createComment,
  createSenderAccount,
} from '@/lib/test/factories';
import type { SendJobData } from './index';

// mock provider 层，避免触发真实发送
const sendReplyMock = vi.fn();
const sendDmMock = vi.fn();

vi.mock('@/lib/sender', () => ({
  getSenderProvider: () => ({
    sendReply: sendReplyMock,
    sendDm: sendDmMock,
  }),
}));

// 安全窗口：默认处于窗口内，各用例可覆盖
const isSafeSendTimeMock = vi.fn(() => true);
const getNextSafeSendTimeMock = vi.fn(() => new Date(Date.now() + 5 * 60 * 1000));

vi.mock('@/lib/safety/compliance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/safety/compliance')>();
  return {
    ...actual,
    isSafeSendTime: () => isSafeSendTimeMock(),
    getNextSafeSendTime: () => getNextSafeSendTimeMock(),
  };
});

import { processSendJob } from './index';

type FakeJob = Bull.Job<SendJobData> & {
  moveToDelayed: ReturnType<typeof vi.fn>;
};

function makeJob(data: SendJobData): FakeJob {
  return {
    data,
    moveToDelayed: vi.fn(async () => {}),
  } as unknown as FakeJob;
}

/** 构造一条待发送的回复任务场景：用户 + 视频 + 评论 + 账号 + PENDING Reply 行 */
async function setupReplyScenario(
  overrides: { proxyUrl?: string | null; content?: string; mode?: string | null; accountId?: string } = {}
) {
  const user = await createUser();
  const video = await createVideo(user.id);
  const comment = await createComment(video.id);
  const account = await createSenderAccount(user.id, {
    proxyUrl: overrides.proxyUrl ?? null,
  });
  const reply = await prisma.reply.create({
    data: {
      content: overrides.content ?? '感谢关注，欢迎交流',
      status: 'PENDING',
      mode: overrides.mode ?? null,
      commentId: comment.id,
    },
  });
  return { user, video, comment, account, reply };
}

async function setupDmScenario(overrides: { proxyUrl?: string | null; content?: string } = {}) {
  const user = await createUser();
  const video = await createVideo(user.id);
  const comment = await createComment(video.id);
  const account = await createSenderAccount(user.id, {
    proxyUrl: overrides.proxyUrl ?? null,
  });
  const dm = await prisma.dm.create({
    data: {
      content: overrides.content ?? '您好，感谢关注',
      status: 'PENDING',
      commentId: comment.id,
    },
  });
  return { user, video, comment, account, dm };
}

describe('processSendJob', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.clearAllMocks();
    isSafeSendTimeMock.mockReturnValue(true);
    sendReplyMock.mockResolvedValue({ success: true });
    sendDmMock.mockResolvedValue({ success: true });
  });

  it('账号配置了 proxyUrl 时，credentials 携带 proxyUrl', async () => {
    const { comment, account, reply } = await setupReplyScenario({
      proxyUrl: 'http://proxy.example.com:8080',
    });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(result.success).toBe(true);
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    const params = sendReplyMock.mock.calls[0][0];
    expect(params.credentials).toEqual({
      cookies: account.cookies,
      proxyUrl: 'http://proxy.example.com:8080',
    });
  });

  it('账号未配置 proxyUrl 时，credentials 不含 proxyUrl 键', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(result.success).toBe(true);
    const params = sendReplyMock.mock.calls[0][0];
    expect(params.credentials).toEqual({ cookies: account.cookies });
    expect(params.credentials).not.toHaveProperty('proxyUrl');
  });

  it('发送内容取自已创建的 Reply 行而非模板', async () => {
    const { comment, account, reply } = await setupReplyScenario({ content: '这条内容由路由写入' });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    await processSendJob(job, 'reply');

    expect(sendReplyMock.mock.calls[0][0].content).toBe('这条内容由路由写入');
  });

  it('非安全窗口时调用 moveToDelayed 且不调用 provider', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    const safeTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
    isSafeSendTimeMock.mockReturnValue(false);
    getNextSafeSendTimeMock.mockReturnValue(safeTime);
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    expect(job.moveToDelayed).toHaveBeenCalledWith(safeTime.getTime());
    expect(sendReplyMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, skipped: true, reason: 'outside-safe-window' });
  });

  it('moveToDelayed 不可用时降级为立即发送', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    isSafeSendTimeMock.mockReturnValue(false);
    const job = { data: { commentId: comment.id, recordId: reply.id, accountId: account.id } } as unknown as FakeJob;

    const result = await processSendJob(job, 'reply');

    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('moveToDelayed 抛错时降级为立即发送', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    isSafeSendTimeMock.mockReturnValue(false);
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });
    job.moveToDelayed.mockRejectedValue(new Error('redis error'));

    const result = await processSendJob(job, 'reply');

    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('安全窗口内私信正常发送且携带 proxyUrl', async () => {
    const { comment, account, dm } = await setupDmScenario({ proxyUrl: 'socks5://127.0.0.1:1080' });
    const job = makeJob({ commentId: comment.id, recordId: dm.id, accountId: account.id });

    const result = await processSendJob(job, 'dm');

    expect(result.success).toBe(true);
    expect(sendDmMock).toHaveBeenCalledTimes(1);
    const params = sendDmMock.mock.calls[0][0];
    expect(params.credentials.proxyUrl).toBe('socks5://127.0.0.1:1080');
  });

  it('回复发送成功：复用同一行更新为 SENT，评论置为 REPLIED，不产生新行', async () => {
    const { comment, account, reply } = await setupReplyScenario({ mode: 'seed' });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(result.success).toBe(true);
    const replies = await prisma.reply.findMany({ where: { commentId: comment.id } });
    expect(replies).toHaveLength(1);
    expect(replies[0].id).toBe(reply.id);
    expect(replies[0].status).toBe('SENT');
    expect(replies[0].sentAt).not.toBeNull();
    const updatedComment = await prisma.comment.findUnique({ where: { id: comment.id } });
    expect(updatedComment?.status).toBe('REPLIED');
  });

  it('种草回复发送成功的活动记录保留 mode=seed 语义', async () => {
    const { user, comment, account, reply } = await setupReplyScenario({ mode: 'seed' });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    await processSendJob(job, 'reply');

    const activity = await prisma.activity.findFirst({
      where: { userId: user.id, type: 'REPLY_SENT' },
    });
    expect(activity?.description).toContain('种草');
  });

  it('私信发送成功：复用同一行更新为 SENT，评论置为 DM_SENT', async () => {
    const { comment, account, dm } = await setupDmScenario();
    const job = makeJob({ commentId: comment.id, recordId: dm.id, accountId: account.id });

    const result = await processSendJob(job, 'dm');

    expect(result.success).toBe(true);
    const dms = await prisma.dm.findMany({ where: { commentId: comment.id } });
    expect(dms).toHaveLength(1);
    expect(dms[0].status).toBe('SENT');
    const updatedComment = await prisma.comment.findUnique({ where: { id: comment.id } });
    expect(updatedComment?.status).toBe('DM_SENT');
  });

  it('幂等：该评论已有其他 SENT 回复时跳过发送，并清理冗余 PENDING 行', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    // 另一条已发送成功的回复（模拟 Bull 重试/重复入队）
    await prisma.reply.create({
      data: { content: '已发出过的回复', status: 'SENT', sentAt: new Date(), commentId: comment.id },
    });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(result).toEqual({ success: true, skipped: true, reason: 'already-sent' });
    expect(sendReplyMock).not.toHaveBeenCalled();
    // 冗余 PENDING 行被清理，避免永远挂在发送中
    const stale = await prisma.reply.findUnique({ where: { id: reply.id } });
    expect(stale).toBeNull();
  });

  it('幂等：记录自身已是 SENT 时直接跳过且保留该行', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    await prisma.reply.update({
      where: { id: reply.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(result).toEqual({ success: true, skipped: true, reason: 'already-sent' });
    expect(sendReplyMock).not.toHaveBeenCalled();
    const kept = await prisma.reply.findUnique({ where: { id: reply.id } });
    expect(kept?.status).toBe('SENT');
  });

  it('发送失败：复用同一行标记 FAILED 并抛错（供 Bull 重试）', async () => {
    sendReplyMock.mockResolvedValue({ success: false, error: '网络连接超时' });
    const { comment, account, reply } = await setupReplyScenario();
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    await expect(processSendJob(job, 'reply')).rejects.toThrow('网络连接超时');

    const replies = await prisma.reply.findMany({ where: { commentId: comment.id } });
    expect(replies).toHaveLength(1);
    expect(replies[0].id).toBe(reply.id);
    expect(replies[0].status).toBe('FAILED');
  });

  it('失败后重试成功：同一行从 FAILED 更新为 SENT', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    await prisma.reply.update({ where: { id: reply.id }, data: { status: 'FAILED' } });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(result.success).toBe(true);
    const replies = await prisma.reply.findMany({ where: { commentId: comment.id } });
    expect(replies).toHaveLength(1);
    expect(replies[0].status).toBe('SENT');
  });

  it('账号日额度在认领时只扣一次（handleSendSuccess 不重复计数）', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    await processSendJob(job, 'reply');

    const updated = await prisma.senderAccount.findUnique({ where: { id: account.id } });
    expect(updated?.dailySent).toBe(1);
  });

  it('未指定 accountId 时通过账号池原子认领账号', async () => {
    const { comment, reply } = await setupReplyScenario();
    const job = makeJob({ commentId: comment.id, recordId: reply.id });

    const result = await processSendJob(job, 'reply');

    expect(result.success).toBe(true);
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
  });

  it('指定账号不可认领（冷却中）时抛错等待重试', async () => {
    const { comment, account, reply } = await setupReplyScenario();
    await prisma.senderAccount.update({
      where: { id: account.id },
      data: { status: 'COOLING' },
    });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    await expect(processSendJob(job, 'reply')).rejects.toThrow('无可用发送账号');
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it('不合规内容自动改写后发送，且记录内容同步为改写结果', async () => {
    const { comment, account, reply } = await setupReplyScenario({
      content: '加我微信：abc123 免费领取资料',
    });
    const job = makeJob({ commentId: comment.id, recordId: reply.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(result.success).toBe(true);
    const sentContent = sendReplyMock.mock.calls[0][0].content as string;
    expect(sentContent).not.toContain('abc123');
    const updated = await prisma.reply.findUnique({ where: { id: reply.id } });
    expect(updated?.content).toBe(sentContent);
    expect(updated?.status).toBe('SENT');
  });
});
