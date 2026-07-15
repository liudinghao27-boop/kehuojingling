/**
 * 抖音 Playwright Provider
 *
 * 通过真实浏览器模拟登录、评论回复与私信发送。
 * 注意：抖音网页版 DOM/文案可能随时调整，以下选择器需要随抖音 UI 变化而更新。
 */

import { chromium, Browser, Page, Locator } from 'playwright';
import {
  SenderProvider,
  SendResult,
  SendReplyParams,
  SendDmParams,
  PlatformCredentials,
} from '../types';
import { randomDelay } from '../utils';

const DEFAULT_TIMEOUT = 30_000;

type DouyinCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
};

/**
 * 解析 credentials.cookies，支持：
 * - JSON 数组 [{name, value, domain, path}]
 * - JSON 对象 {name, value, domain, path}
 * - key=value; key2=value2 字符串
 */
function parseCookies(raw: string): DouyinCookie[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr
        .map((item: Record<string, unknown>) => ({
          name: String(item.name ?? ''),
          value: String(item.value ?? ''),
          domain: String(item.domain ?? '.douyin.com'),
          path: String(item.path ?? '/'),
        }))
        .filter((c) => c.name);
    } catch {
      // 解析失败，继续按字符串处理
    }
  }

  const cookies: DouyinCookie[] = [];
  const pairs = trimmed.split(';');
  for (const pair of pairs) {
    const [keyPart, ...valueParts] = pair.trim().split('=');
    const key = keyPart?.trim();
    if (!key) continue;

    const rawValue = valueParts.join('=').trim();
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      // 无法解码时保留原始值
    }

    cookies.push({
      name: key,
      value,
      domain: '.douyin.com',
      path: '/',
    });
  }

  return cookies;
}

/**
 * 从调用参数或环境变量读取 Cookie 字符串。
 * 优先使用 params.credentials.cookies，否则回退到 DOUYIN_COOKIES。
 */
function getCookies(
  params: SendReplyParams | SendDmParams
): string | undefined {
  const extended = params as
    | (SendReplyParams & { credentials?: PlatformCredentials })
    | (SendDmParams & { credentials?: PlatformCredentials });
  return extended.credentials?.cookies ?? process.env.DOUYIN_COOKIES;
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    console.error('Playwright 启动失败:', error);
    throw new Error(
      '浏览器启动失败，请检查服务器环境是否支持 Playwright'
    );
  }
}

async function withBrowser<T>(
  cookiesRaw: string | undefined,
  operation: (page: Page) => Promise<T>
): Promise<T> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    context.setDefaultTimeout(DEFAULT_TIMEOUT);

    if (cookiesRaw) {
      const cookies = parseCookies(cookiesRaw);
      if (cookies.length === 0) {
        throw new Error('Cookie 格式无效');
      }
      console.log(`[DouyinSender] 加载 ${cookies.length} 个 Cookie`);
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);

    // 收集页面控制台日志，便于排查抖音反爬/错误
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[DouyinSender:page:error] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      console.log(`[DouyinSender:page:error] ${err.message}`);
    });

    return await operation(page);
  } finally {
    await browser.close();
  }
}

/**
 * 在评论区滚动查找包含目标作者名且含有「回复」按钮的评论容器。
 * 选择器可能需随抖音 UI 调整。
 */
async function findCommentContainer(
  page: Page,
  authorName: string,
  maxAttempts = 5
): Promise<Locator | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const container = page
      .locator('div')
      .filter({ hasText: authorName })
      .filter({ has: page.locator('text=回复') })
      .first();

    const visible = await container.isVisible().catch(() => false);
    if (visible) return container;

    await page.evaluate(() => window.scrollBy(0, 600));
    await randomDelay(800, 1500);
  }
  return null;
}

async function sendReplyOperation(
  page: Page,
  params: SendReplyParams
): Promise<SendResult> {
  const { videoUrl, content, authorName } = params;

  console.log(`[DouyinSender:reply] 打开视频页: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
  await randomDelay(1000, 3000);

  const currentUrl = page.url();
  console.log(`[DouyinSender:reply] 当前页面: ${currentUrl}`);
  if (currentUrl.includes('login') || currentUrl.includes('verify')) {
    return { success: false, error: 'Cookie 失效或需要登录验证' };
  }

  const container = await findCommentContainer(page, authorName);
  if (!container) {
    return { success: false, error: `未找到作者「${authorName}」的评论` };
  }
  console.log(`[DouyinSender:reply] 找到评论容器`);

  const replyBtn = container.locator('text=回复').first();
  const replyVisible = await replyBtn.isVisible().catch(() => false);
  if (!replyVisible) {
    return { success: false, error: '未找到回复按钮' };
  }
  await replyBtn.click();
  console.log(`[DouyinSender:reply] 点击回复按钮`);
  await randomDelay(1000, 2000);

  // 优先在评论容器内定位输入框，若不存在则在页面级定位
  const input = container
    .locator('textarea, [contenteditable="true"], input[type="text"]')
    .first()
    .or(page.locator('textarea').last());

  const inputVisible = await input.isVisible().catch(() => false);
  if (!inputVisible) {
    return { success: false, error: '未找到回复输入框' };
  }
  await input.fill(content);
  console.log(`[DouyinSender:reply] 填写回复内容`);
  await randomDelay(1000, 2000);

  const sendBtn = container.locator('text=发送').first().or(page.locator('text=发送').last());
  const sendVisible = await sendBtn.isVisible().catch(() => false);
  if (!sendVisible) {
    return { success: false, error: '未找到发送按钮' };
  }
  await sendBtn.click();
  console.log(`[DouyinSender:reply] 点击发送按钮`);

  // 等待发送成功标识（新回复出现或 Toast）
  await page.waitForTimeout(2000);

  return { success: true };
}

async function sendDmOperation(
  page: Page,
  params: SendDmParams
): Promise<SendResult> {
  const { videoUrl, authorName, content } = params;

  console.log(`[DouyinSender:dm] 打开视频页: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
  await randomDelay(1000, 3000);

  const currentUrl = page.url();
  console.log(`[DouyinSender:dm] 当前页面: ${currentUrl}`);
  if (currentUrl.includes('login') || currentUrl.includes('verify')) {
    return { success: false, error: 'Cookie 失效或需要登录验证' };
  }

  const container = await findCommentContainer(page, authorName);
  if (!container) {
    return { success: false, error: `未找到作者「${authorName}」的评论` };
  }

  // 点击评论作者昵称/头像进入主页；优先尝试 <a> 标签，再退回到文本元素。
  const authorLink = container
    .locator('a')
    .filter({ hasText: authorName })
    .first()
    .or(container.getByText(authorName).first());

  const authorVisible = await authorLink.isVisible().catch(() => false);
  if (!authorVisible) {
    return { success: false, error: '未找到评论作者入口' };
  }

  await Promise.all([
    page.waitForURL(/\/user\//, { timeout: DEFAULT_TIMEOUT }),
    authorLink.click(),
  ]);
  await randomDelay(1000, 3000);

  // 点击「私信」按钮
  const dmBtn = page.locator('text=私信').first();
  const dmVisible = await dmBtn.isVisible().catch(() => false);
  if (!dmVisible) {
    return { success: false, error: '未找到私信按钮' };
  }
  await dmBtn.click();
  await randomDelay(1000, 2000);

  // 私信输入框
  const input = page
    .locator('textarea, [contenteditable="true"], input[type="text"]')
    .first();
  const inputVisible = await input.isVisible().catch(() => false);
  if (!inputVisible) {
    return { success: false, error: '未找到私信输入框' };
  }
  await input.fill(content);
  await randomDelay(1000, 2000);

  const sendBtn = page.locator('text=发送').first();
  const sendVisible = await sendBtn.isVisible().catch(() => false);
  if (!sendVisible) {
    return { success: false, error: '未找到私信发送按钮' };
  }
  await sendBtn.click();

  await page.waitForTimeout(2000);

  return { success: true };
}

export const douyinProvider: SenderProvider = {
  async validateCredentials(credentials: PlatformCredentials) {
    const cookies = credentials.cookies;
    if (!cookies) {
      return { valid: false, error: '未提供 Cookie' };
    }

    try {
      await withBrowser(cookies, async (page) => {
        await page.goto('https://www.douyin.com/', {
          waitUntil: 'domcontentloaded',
        });
        await randomDelay(1500, 3000);

        const recommend = page.locator('text=推荐').first();
        const publish = page.locator('text=发布').first();
        const login = page.locator('text=登录').first();

        const isLoggedIn =
          (await recommend.isVisible().catch(() => false)) ||
          (await publish.isVisible().catch(() => false));
        const isLoginPrompt = await login.isVisible().catch(() => false);

        if (!isLoggedIn || isLoginPrompt) {
          throw new Error('Cookie 失效或无法登录抖音');
        }
      });

      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cookie 验证失败';
      return { valid: false, error: message };
    }
  },

  async sendReply(params: SendReplyParams): Promise<SendResult> {
    const cookies = getCookies(params);
    if (!cookies) {
      return { success: false, error: '未配置抖音 Cookie' };
    }

    try {
      return await withBrowser(cookies, (page) => sendReplyOperation(page, params));
    } catch (error) {
      const message = error instanceof Error ? error.message : '回复发送失败';
      return { success: false, error: message };
    }
  },

  async sendDm(params: SendDmParams): Promise<SendResult> {
    const cookies = getCookies(params);
    if (!cookies) {
      return { success: false, error: '未配置抖音 Cookie' };
    }

    try {
      return await withBrowser(cookies, (page) => sendDmOperation(page, params));
    } catch (error) {
      const message = error instanceof Error ? error.message : '私信发送失败';
      return { success: false, error: message };
    }
  },
};
