import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendAlert, buildAccountCoolingAlert } from './alert';
import { clearDatabase, prisma } from '@/lib/test/setup';
import { createUser } from '@/lib/test/factories';

describe('sendAlert', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('未启用告警时不发请求，返回 false', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertEnabled: false,
        alertChannelType: 'dingtalk',
        alertWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendAlert(user.id, '标题', '内容');

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('未配置 webhook 时不发请求，返回 false', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { alertEnabled: true, alertChannelType: 'dingtalk' },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendAlert(user.id, '标题', '内容');

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('钉钉渠道发送 markdown 格式消息', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertEnabled: true,
        alertChannelType: 'dingtalk',
        alertWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendAlert(user.id, '测试标题', '测试内容');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oapi.dingtalk.com/robot/send?access_token=abc');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      msgtype: 'markdown',
      markdown: { title: '测试标题', text: '测试内容' },
    });
  });

  it('企业微信渠道使用相同 markdown 格式', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertEnabled: true,
        alertChannelType: 'wecom',
        alertWebhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc',
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendAlert(user.id, '标题', '内容');

    expect(result).toBe(true);
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body).msgtype).toBe('markdown');
  });

  it('fetch 抛错时不抛出异常，返回 false', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertEnabled: true,
        alertChannelType: 'dingtalk',
        alertWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(sendAlert(user.id, '标题', '内容')).resolves.toBe(false);
  });

  it('webhook 返回非 2xx 时返回 false', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertEnabled: true,
        alertChannelType: 'dingtalk',
        alertWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await sendAlert(user.id, '标题', '内容');
    expect(result).toBe(false);
  });
});

describe('buildAccountCoolingAlert', () => {
  it('生成包含账号、平台、原因的告警消息', () => {
    const { title, content } = buildAccountCoolingAlert('主号', 'DOUYIN', '连续失败 3 次');

    expect(title).toBeTruthy();
    expect(content).toContain('主号');
    expect(content).toContain('DOUYIN');
    expect(content).toContain('连续失败 3 次');
  });
});
