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

async function setupSendScenario(accountOverrides: { proxyUrl?: string | null } = {}) {
  const user = await createUser();
  const video = await createVideo(user.id);
  const comment = await createComment(video.id);
  const template = await prisma.replyTemplate.create({
    data: { name: '测试模板', content: '感谢关注，欢迎交流', userId: user.id },
  });
  const account = await createSenderAccount(user.id, {
    proxyUrl: accountOverrides.proxyUrl ?? null,
  });
  return { user, comment, template, account };
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
    const { comment, template, account } = await setupSendScenario({
      proxyUrl: 'http://proxy.example.com:8080',
    });
    const job = makeJob({ commentId: comment.id, templateId: template.id, accountId: account.id });

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
    const { comment, template, account } = await setupSendScenario();
    const job = makeJob({ commentId: comment.id, templateId: template.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(result.success).toBe(true);
    const params = sendReplyMock.mock.calls[0][0];
    expect(params.credentials).toEqual({ cookies: account.cookies });
    expect(params.credentials).not.toHaveProperty('proxyUrl');
  });

  it('非安全窗口时调用 moveToDelayed 且不调用 provider', async () => {
    const { comment, template, account } = await setupSendScenario();
    const safeTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
    isSafeSendTimeMock.mockReturnValue(false);
    getNextSafeSendTimeMock.mockReturnValue(safeTime);
    const job = makeJob({ commentId: comment.id, templateId: template.id, accountId: account.id });

    const result = await processSendJob(job, 'reply');

    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    expect(job.moveToDelayed).toHaveBeenCalledWith(safeTime.getTime());
    expect(sendReplyMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, skipped: true, reason: 'outside-safe-window' });
  });

  it('moveToDelayed 不可用时降级为立即发送', async () => {
    const { comment, template, account } = await setupSendScenario();
    isSafeSendTimeMock.mockReturnValue(false);
    const job = { data: { commentId: comment.id, templateId: template.id, accountId: account.id } } as unknown as FakeJob;

    const result = await processSendJob(job, 'reply');

    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('moveToDelayed 抛错时降级为立即发送', async () => {
    const { comment, template, account } = await setupSendScenario();
    isSafeSendTimeMock.mockReturnValue(false);
    const job = makeJob({ commentId: comment.id, templateId: template.id, accountId: account.id });
    job.moveToDelayed.mockRejectedValue(new Error('redis error'));

    const result = await processSendJob(job, 'reply');

    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('安全窗口内私信正常发送且携带 proxyUrl', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    const template = await prisma.dmTemplate.create({
      data: { name: '私信模板', content: '您好，感谢关注', userId: user.id },
    });
    const account = await createSenderAccount(user.id, { proxyUrl: 'socks5://127.0.0.1:1080' });
    const job = makeJob({ commentId: comment.id, templateId: template.id, accountId: account.id });

    const result = await processSendJob(job, 'dm');

    expect(result.success).toBe(true);
    expect(sendDmMock).toHaveBeenCalledTimes(1);
    const params = sendDmMock.mock.calls[0][0];
    expect(params.credentials.proxyUrl).toBe('socks5://127.0.0.1:1080');
  });
});
