/**
 * 抖音 Playwright Provider
 *
 * 通过真实浏览器模拟登录、评论回复与私信发送。
 * 注意：抖音网页版 DOM/文案可能随时调整，以下选择器需要随抖音 UI 变化而更新。
 */

import { chromium, Browser, BrowserContext, Page, Locator, ElementHandle } from 'playwright';
import fs from 'fs';
import path from 'path';
import {
  SenderProvider,
  SendResult,
  SendReplyParams,
  SendDmParams,
  PlatformCredentials,
} from '../types';
import { randomDelay } from '../utils';

const DEFAULT_TIMEOUT = 30_000;
const DEBUG_DIR = path.join(process.cwd(), 'logs', 'douyin-sender');

// ---------------------------------------------------------------------------
// 环境开关
// ---------------------------------------------------------------------------

function isDebugEnabled(): boolean {
  return process.env.SENDER_DEBUG === '1';
}

function isHeadless(): boolean {
  return process.env.SENDER_HEADLESS?.toLowerCase() !== 'false';
}

// ---------------------------------------------------------------------------
// Debug 辅助（仅当 SENDER_DEBUG=1 时生效）
// ---------------------------------------------------------------------------

function ensureDebugDir(): void {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
}

async function debugScreenshot(page: Page, name: string): Promise<string> {
  if (!isDebugEnabled()) return '';
  ensureDebugDir();
  const filePath = path.join(DEBUG_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[DouyinSender] 截图已保存: ${filePath}`);
  return filePath;
}

function debugLog(...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  console.log('[DouyinSender:debug]', ...args);
}

// ---------------------------------------------------------------------------
// Cookie 解析
// ---------------------------------------------------------------------------

export type DouyinCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
};

/**
 * 解析 credentials.cookies，支持：
 * - JSON 数组 [{name, value, domain, path, secure, httpOnly, sameSite}]
 * - JSON 对象 {name, value, domain, path}
 * - key=value; key2=value2 字符串（降级，丢失 domain 信息）
 */
export function parseCookies(raw: string): DouyinCookie[] {
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
    const normalized = pair.trim();
    if (!normalized.includes('=')) continue;

    const [keyPart, ...valueParts] = normalized.split('=');
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
export function getCookies(
  params: SendReplyParams | SendDmParams
): string | undefined {
  const extended = params as
    | (SendReplyParams & { credentials?: PlatformCredentials })
    | (SendDmParams & { credentials?: PlatformCredentials });
  return extended.credentials?.cookies ?? process.env.DOUYIN_COOKIES;
}

// ---------------------------------------------------------------------------
// 浏览器生命周期（共享上下文 + 清理）
// ---------------------------------------------------------------------------

type LaunchResult = { browser: Browser; context: BrowserContext };

async function launchContext(): Promise<LaunchResult> {
  const headless = isHeadless();
  try {
    if (headless) {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      return { browser, context };
    }

    // 非无头模式优先使用持久化浏览器资料目录，登录/验证状态可复用
    const profileDir = path.join(DEBUG_DIR, 'browser-profile');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    try {
      const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
      });
      console.log('[DouyinSender] 使用持久化浏览器上下文');
      const browser = context.browser();
      if (!browser) {
        throw new Error('无法获取持久化上下文对应的浏览器实例');
      }
      return { browser, context };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[DouyinSender] 持久化浏览器上下文启动失败: ${message}`);
      console.warn('[DouyinSender] 改用临时上下文（登录态不会持久化，重启 dev server 后需重新登录）');
      // 残留 Chrome 进程可能锁住了 profile，fallback 到非持久化上下文
      const browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      return { browser, context };
    }
  } catch (error) {
    console.error('Playwright 启动失败:', error);
    throw new Error('浏览器启动失败，请检查服务器环境是否支持 Playwright');
  }
}

// 用 globalThis 保存共享状态，避免 Next.js 热重载模块后丢失已启动的浏览器实例
type SharedSenderState = {
  __douyinSenderBrowser?: Browser | null;
  __douyinSenderContext?: BrowserContext | null;
  __douyinSenderContextPromise?: Promise<BrowserContext> | null;
};

const g = globalThis as unknown as SharedSenderState;

function getSharedState() {
  return {
    browser: g.__douyinSenderBrowser ?? null,
    context: g.__douyinSenderContext ?? null,
    promise: g.__douyinSenderContextPromise ?? null,
  };
}

function setSharedState(
  browser: Browser | null,
  context: BrowserContext | null,
  promise: Promise<BrowserContext> | null
) {
  g.__douyinSenderBrowser = browser;
  g.__douyinSenderContext = context;
  g.__douyinSenderContextPromise = promise;
}

let cleanupRegistered = false;

function registerCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const closeBrowser = async () => {
    const { browser } = getSharedState();
    if (browser) {
      await browser.close().catch(() => {});
    }
  };

  process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
  });

  process.on('exit', () => {
    const { browser } = getSharedState();
    if (browser) {
      // exit 事件内无法异步 close，直接杀掉浏览器进程
      const childProcess = (
        browser as unknown as { process?: () => import('child_process').ChildProcess | undefined }
      ).process?.();
      childProcess?.kill('SIGKILL');
    }
  });
}

async function getSharedContext(cookiesRaw: string | undefined): Promise<BrowserContext> {
  registerCleanup();
  const state = getSharedState();

  if (state.context) {
    try {
      // 用 newPage 真实检测 context 是否还活着（pages() 在窗口刚关闭时可能不抛错）
      const testPage = await state.context.newPage();
      await testPage.close();
      return state.context;
    } catch {
      console.log('[DouyinSender] 共享浏览器上下文已关闭，准备重启');
      setSharedState(null, null, null);
    }
  }

  if (getSharedState().promise) return getSharedState().promise!;

  let resolveContext: (context: BrowserContext) => void;
  let rejectContext: (reason: unknown) => void;
  const startPromise = new Promise<BrowserContext>((resolve, reject) => {
    resolveContext = resolve;
    rejectContext = reject;
  });
  setSharedState(getSharedState().browser, null, startPromise);

  (async () => {
    try {
      // 关闭旧的 browser，避免残留进程
      const oldBrowser = getSharedState().browser;
      if (oldBrowser) {
        await oldBrowser.close().catch(() => {});
      }

      const { browser, context } = await launchContext();
      setSharedState(browser, context, startPromise);

      if (cookiesRaw) {
        const cookies = parseCookies(cookiesRaw);
        if (cookies.length > 0) {
          console.log(`[DouyinSender] 加载 ${cookies.length} 个 Cookie`);
          await context.addCookies(cookies);
        }
      }
      context.setDefaultTimeout(DEFAULT_TIMEOUT);
      resolveContext!(context);
    } catch (err) {
      setSharedState(null, null, null);
      rejectContext!(err);
    }
  })();

  return startPromise;
}

async function withBrowser<T>(
  cookiesRaw: string | undefined,
  operation: (page: Page) => Promise<T>
): Promise<T> {
  const headless = isHeadless();

  if (!headless) {
    // 可见模式：复用同一个浏览器上下文，避免每次重新登录
    const context = await getSharedContext(cookiesRaw);
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);

    page.on('console', (msg: { type: () => string; text: () => string }) => {
      if (msg.type() === 'error') {
        console.log(`[DouyinSender:page:error] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err: { message: string }) => {
      console.log(`[DouyinSender:page:error] ${err.message}`);
    });

    try {
      return await operation(page);
    } finally {
      await page.close();
    }
  }

  // 无头模式：每次新建上下文，保持原有行为
  const { browser, context } = await launchContext();
  try {
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

    page.on('console', (msg: { type: () => string; text: () => string }) => {
      if (msg.type() === 'error') {
        console.log(`[DouyinSender:page:error] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err: { message: string }) => {
      console.log(`[DouyinSender:page:error] ${err.message}`);
    });

    return await operation(page);
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// 认证与弹窗
// ---------------------------------------------------------------------------

/**
 * 检测当前页面是否处于登录/验证弹窗状态。
 */
async function detectAuthDialog(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const text = document.body.innerText;
    if (text.includes('登录后免费畅享高清视频') || text.includes('扫码登录')) {
      return 'LOGIN_QR';
    }
    // 抖音校验形式：短信验证码、普通验证码、手机号校验、账户安全校验
    if (
      text.includes('接收短信验证码') ||
      text.includes('短信验证码') ||
      text.includes('收到的验证码') ||
      text.includes('请输入验证码') ||
      (text.includes('验证码') && text.includes('校验'))
    ) {
      return 'SMS_VERIFY';
    }
    if (text.includes('验证') && (text.includes('手机号') || text.includes('账户安全'))) {
      return 'PHONE_VERIFY';
    }
    if (text.includes('是否保存登录信息')) {
      return 'SAVE_LOGIN';
    }
    return null;
  });
}

/**
 * 在可见浏览器模式下，如果检测到登录/验证弹窗，等待用户手动完成。
 */
async function waitForManualAuth(page: Page): Promise<boolean> {
  const dialog = await detectAuthDialog(page).catch(() => null);
  if (!dialog) return true;

  // 无头模式下无法手动完成验证，若检测到弹窗则直接失败
  if (isHeadless()) return false;

  const dialogLabel =
    dialog === 'LOGIN_QR' ? '登录' : dialog === 'SAVE_LOGIN' ? '保存登录信息' : '验证';
  console.log(`[DouyinSender] 检测到${dialogLabel}弹窗，请在打开的浏览器窗口中手动完成（120秒超时）`);

  // 如果是「保存登录信息」弹窗，自动点击「保存」以保证下次免登录
  if (dialog === 'SAVE_LOGIN') {
    await dismissLoginPopups(page);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    return true;
  }

  const start = Date.now();
  while (Date.now() - start < 120_000) {
    await page.waitForTimeout(2000);
    // 登录过程可能会触发页面导航，evaluate 可能短暂失败，忽略并继续等待
    const still = await detectAuthDialog(page).catch(() => null);
    if (still === 'SAVE_LOGIN') {
      await dismissLoginPopups(page);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return true;
    }
    if (still === null) {
      // 可能是页面正在导航，稍等一下再检测
      await page.waitForTimeout(1500);
      const afterNav = await detectAuthDialog(page).catch(() => null);
      if (afterNav === 'SAVE_LOGIN') {
        await dismissLoginPopups(page);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        return true;
      }
      if (!afterNav) {
        console.log('[DouyinSender] 弹窗已消失，继续执行');
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        return true;
      }
    }
    if (!still) {
      console.log('[DouyinSender] 弹窗已消失，继续执行');
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return true;
    }
  }
  return false;
}

/**
 * 关闭抖音登录后可能弹出的「是否保存登录信息？」遮罩。
 * 该弹窗会遮挡评论区，导致评论容器定位失败。
 */
async function dismissLoginPopups(page: Page): Promise<boolean> {
  const dialog = page
    .locator('div[role="dialog"], div[class*="dialog"], div[class*="modal"]')
    .filter({ hasText: '是否保存登录信息' })
    .first();

  const visible = await dialog.isVisible().catch(() => false);
  if (!visible) return false;

  console.log('[DouyinSender] 检测到保存登录信息弹窗，尝试关闭');
  const saveBtn = dialog.locator('text=保存').first();
  const cancelBtn = dialog.locator('text=取消').first();

  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
  } else if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click();
  }

  await randomDelay(1000, 1500);
  return true;
}

// ---------------------------------------------------------------------------
// 评论区操作
// ---------------------------------------------------------------------------

/**
 * 等待评论区加载完成。
 * 注意：不主动切换「最热/最新」排序，因为抓取时的评论来自默认排序。
 */
async function prepareCommentSection(page: Page): Promise<void> {
  // 先处理可能弹出的登录信息保存弹窗
  await dismissLoginPopups(page);

  // 滚动到评论区，触发懒加载
  await page.evaluate(() => {
    const commentSection = document.querySelector(
      '[class*="comment"], [class*="Comment"], [data-e2e="comment-list"]'
    );
    if (commentSection) {
      commentSection.scrollIntoView({ behavior: 'instant', block: 'start' });
    } else {
      const scrollHeight =
        document.body?.scrollHeight ??
        document.documentElement?.scrollHeight ??
        0;
      window.scrollTo(0, scrollHeight);
    }
  });
  await randomDelay(1500, 2500);

  // 等待评论区骨架屏消失或评论容器出现
  try {
    await page.waitForSelector('text=回复', { timeout: 10_000 });
  } catch {
    console.log('[DouyinSender] 10s 内未出现回复按钮，继续尝试');
  }
}

/**
 * 提取当前可见的评论文本，用于调试匹配失败场景。
 */
async function logVisibleComments(page: Page, limit = 10): Promise<void> {
  if (!isDebugEnabled()) return;

  const texts = await page.evaluate((max) => {
    const results: string[] = [];
    const replyButtons = Array.from(document.querySelectorAll('*')).filter(
      (el) => el.textContent?.trim() === '回复' && el.tagName !== 'SCRIPT'
    );

    for (const btn of replyButtons.slice(0, max)) {
      let item = btn.closest('[class*="comment"], [class*="Comment"], [data-e2e]');
      if (!item) {
        // 向上找 5 层父元素
        let cur: HTMLElement | null = btn.parentElement as HTMLElement | null;
        for (let i = 0; i < 5 && cur; i++) {
          item = cur;
          cur = cur.parentElement;
        }
      }
      const text = item?.textContent?.replace(/\s+/g, ' ').slice(0, 120) ?? '';
      if (text && !results.includes(text)) results.push(text);
    }
    return results;
  }, limit);

  debugLog('当前可见评论样本:', JSON.stringify(texts, null, 2));
}

/**
 * 抖音网页版 body 不可滚动，内容区在独立的 overflow:auto 容器内。
 * 找到包含评论区的可滚动祖先元素，用于后续滚动加载更多评论。
 */
async function getCommentScrollContainer(page: Page): Promise<ElementHandle<Node> | null> {
  return page.evaluateHandle(() => {
    const commentMarker =
      document.querySelector('[class*="comment"], [class*="Comment"], [data-e2e="comment-list"]') ||
      Array.from(document.querySelectorAll('*')).find((el) =>
        el.textContent?.includes('全部评论')
      );
    if (!commentMarker) return null;

    let el: Element | null = commentMarker;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const overflow = style.overflow;
      const isScrollable =
        (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll') &&
        el.scrollHeight > el.clientHeight;
      if (isScrollable) return el;
      el = el.parentElement;
    }
    return null;
  }).then((handle) => handle.asElement());
}

/**
 * 滚动评论区容器，触发抖音懒加载更多评论。
 */
async function scrollCommentSection(page: Page, distance: number): Promise<void> {
  const container = await getCommentScrollContainer(page);
  if (container) {
    await container.evaluate((el, d) => {
      (el as HTMLElement).scrollTop += d;
    }, distance);
  } else {
    // 降级：滚动窗口
    await page.evaluate((d) => window.scrollBy(0, d), distance);
  }
  await randomDelay(1200, 2000);
}

/**
 * 通过 JS 遍历 DOM 文本，找到包含目标关键词的评论项。
 * 比 Playwright 的 hasText 过滤器更稳定，能处理表情、省略号、截断等情况。
 */
async function findCommentByJs(
  page: Page,
  keyword: string
): Promise<Locator | null> {
  const markId = `douyin-sender-${Date.now()}`;

  const found = await page.evaluate(
    ({ keyword, markId }) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.includes(keyword)) continue;

        let el: HTMLElement | null = node.parentElement;
        while (el && el.tagName !== 'BODY') {
          const hasReply = Array.from(el.querySelectorAll('*')).some(
            (e) => e.textContent?.trim() === '回复'
          );
          const rect = el.getBoundingClientRect();
          // 评论项通常高度大于 50、宽度较大，且包含「回复」按钮
          if (hasReply && rect.height > 40 && rect.width > 200) {
            el.setAttribute(`data-${markId}`, '');
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            return true;
          }
          el = el.parentElement;
        }
      }
      return false;
    },
    { keyword, markId }
  );

  if (!found) return null;

  const locator = page.locator(`[data-${markId}]`).first();
  const visible = await locator.isVisible().catch(() => false);
  return visible ? locator : null;
}

/**
 * 在评论区滚动查找包含目标评论内容且含有「回复」按钮的评论容器。
 * 优先用内容匹配（authorName 可能被截断或显示为特殊符号）。
 * 选择器可能需随抖音 UI 调整。
 */
async function findCommentContainer(
  page: Page,
  content: string,
  maxScrollAttempts = 20
): Promise<Locator | null> {
  await prepareCommentSection(page);

  // 清理关键词：去掉 [表情]、只保留前 30 个字符
  const keyword = content.replace(/\[.+?\]/g, '').slice(0, 30).trim();
  if (keyword.length < 4) {
    return null;
  }

  console.log(`[DouyinSender] 查找评论关键词: ${keyword}`);

  // 第一轮：直接在当前已加载的评论中查找
  let container = await findCommentByJs(page, keyword);
  if (container) {
    console.log('[DouyinSender] 直接找到评论容器');
    return container;
  }

  // 第二轮：滚动评论区容器，触发更多评论懒加载
  console.log('[DouyinSender] 开始滚动查找评论');
  for (let attempt = 0; attempt < maxScrollAttempts; attempt++) {
    await scrollCommentSection(page, 1200);

    container = await findCommentByJs(page, keyword);
    if (container) {
      console.log(`[DouyinSender] 第 ${attempt + 1} 次滚动后找到评论容器`);
      return container;
    }
  }

  // 第三轮：如果页面有「最新」排序，尝试切换后再查找
  const latestTab = page.locator('text=最新').first();
  const latestVisible = await latestTab.isVisible().catch(() => false);
  if (latestVisible) {
    console.log('[DouyinSender] 默认排序未找到，切换到「最新」再试');
    await latestTab.click();
    await randomDelay(1500, 2500);

    container = await findCommentByJs(page, keyword);
    if (container) return container;

    for (let attempt = 0; attempt < Math.floor(maxScrollAttempts / 2); attempt++) {
      await scrollCommentSection(page, 1200);
      container = await findCommentByJs(page, keyword);
      if (container) return container;
    }
  }

  await logVisibleComments(page);
  return null;
}

/**
 * 定位回复输入框。
 * 抖音点击「回复」后，输入框可能：
 * 1. 在评论容器内出现 textarea/contenteditable
 * 2. 聚焦到顶部主评论输入框
 * 3. 以 placeholder/aria-label 标识的回复框
 */
async function locateReplyInput(
  page: Page,
  container: Locator
): Promise<Locator | null> {
  // 策略 A：容器内输入框
  const containerInput = container
    .locator('textarea, [contenteditable="true"], input[type="text"]')
    .first();
  if (await containerInput.isVisible().catch(() => false)) {
    return containerInput;
  }

  // 策略 B：页面级可见输入框（优先回复相关）
  const pageInputs = page.locator('textarea, [contenteditable="true"]').filter({ visible: true });
  const count = await pageInputs.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const candidate = pageInputs.nth(i);
    const placeholder = await candidate.getAttribute('placeholder').catch(() => '');
    const ariaLabel = await candidate.getAttribute('aria-label').catch(() => '');
    const text = `${placeholder} ${ariaLabel}`;
    if (text.includes('回复') || text.includes('评论') || text.includes('说点什么')) {
      return candidate;
    }
  }
  // 若未按 placeholder 命中，取最后一个（通常是最新弹出的）
  if (count > 0) {
    return pageInputs.last();
  }

  return null;
}

// ---------------------------------------------------------------------------
// 回复
// ---------------------------------------------------------------------------

async function sendReplyOperation(
  page: Page,
  params: SendReplyParams
): Promise<SendResult> {
  const { videoUrl, content, authorName, commentContent } = params;

  console.log(`[DouyinSender:reply] 打开视频页: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
  await randomDelay(1000, 3000);

  // 登录后弹窗会遮挡评论区，尽早关闭
  await dismissLoginPopups(page);

  // 可见窗口模式下，若弹出登录/验证框，等待用户手动完成
  const authReady = await waitForManualAuth(page);
  if (!authReady) {
    return { success: false, error: '未在可见浏览器窗口中完成登录/验证' };
  }

  // 登录后页面可能跳转到首页，若不在视频页则重新打开
  let currentUrl = page.url();
  console.log(`[DouyinSender:reply] 当前页面: ${currentUrl}`);
  if (!currentUrl.includes('/video/')) {
    console.log(`[DouyinSender:reply] 登录后页面已跳转，重新打开视频页`);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay(1500, 2500);
    currentUrl = page.url();
    console.log(`[DouyinSender:reply] 重新加载后页面: ${currentUrl}`);
  }

  if (currentUrl.includes('login') || currentUrl.includes('verify')) {
    return { success: false, error: 'Cookie 失效或需要登录验证' };
  }

  // 从抓取数据获取到的 authorName 可能为截断/特殊符号，改用评论内容匹配
  const container = await findCommentContainer(page, commentContent || authorName);
  if (!container) {
    const screenshot = await debugScreenshot(page, 'reply-not-found').catch(() => '');
    return {
      success: false,
      error: `未找到目标评论内容：${commentContent || authorName}${screenshot ? `（已截图：${screenshot}）` : ''}`,
    };
  }
  console.log(`[DouyinSender:reply] 找到评论容器`);

  const replyBtn = container.locator('text=回复').first();
  const replyVisible = await replyBtn.isVisible().catch(() => false);
  if (!replyVisible) {
    return { success: false, error: '未找到回复按钮' };
  }
  await replyBtn.click();
  console.log(`[DouyinSender:reply] 点击回复按钮`);
  await randomDelay(1500, 2500);

  // 调试：点击回复后截图，观察输入框形态
  await debugScreenshot(page, 'reply-after-click');

  const input = await locateReplyInput(page, container);
  if (!input || !(await input.isVisible().catch(() => false))) {
    return { success: false, error: '未找到回复输入框' };
  }

  await input.fill(content);
  console.log(`[DouyinSender:reply] 填写回复内容`);
  await randomDelay(1000, 2000);

  // 调试：填写内容后截图，观察发送按钮形态
  await debugScreenshot(page, 'reply-after-fill');

  // 抖音发送按钮通常是输入框右侧的红色纸飞机图标，不是文字「发送」。
  // 用 JS 在输入框父级内找最右侧的可点击元素，命中率最高。
  const clicked = await input.evaluate((el) => {
    const inputEl = el as HTMLElement;
    let scope: HTMLElement | null = inputEl;
    for (let level = 0; level < 4 && scope; level++) {
      const all = scope.querySelectorAll('*');
      const candidates: HTMLElement[] = [];
      for (let i = 0; i < all.length; i++) {
        const child = all[i] as HTMLElement;
        if (child === inputEl) continue;
        const style = window.getComputedStyle(child);
        const rect = child.getBoundingClientRect();
        const isClickable =
          style.cursor === 'pointer' ||
          child.tagName === 'BUTTON' ||
          child.getAttribute('role') === 'button' ||
          child.hasAttribute('data-e2e') ||
          child.className?.includes('send') ||
          child.className?.includes('submit');
        if (isClickable && rect.width > 0 && rect.height > 0) {
          candidates.push(child);
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
        candidates[0].click();
        return true;
      }
      scope = scope.parentElement;
    }
    return false;
  });

  if (clicked) {
    console.log(`[DouyinSender:reply] 已点击输入框附近发送按钮`);
  } else {
    console.log(`[DouyinSender:reply] 未找到发送按钮，尝试回车发送`);
    await input.press('Enter');
  }

  // 等待发送完成并检测风控/验证弹窗
  await page.waitForTimeout(2500);
  await debugScreenshot(page, 'reply-after-send');

  const detectBlock = async () =>
    page.evaluate((): string | null => {
      const text = document.body.innerText;
      if (
        text.includes('接收短信验证码') ||
        text.includes('短信验证码') ||
        text.includes('收到的验证码') ||
        text.includes('请输入验证码') ||
        (text.includes('验证码') && text.includes('校验'))
      ) {
        return 'SMS_VERIFY';
      }
      if (text.includes('验证') && (text.includes('手机号') || text.includes('账户安全'))) {
        return 'PHONE_VERIFY';
      }
      if (text.includes('登录后免费畅享高清视频') || text.includes('扫码登录')) {
        return 'LOGIN_QR';
      }
      return null;
    });

  let blocked = await detectBlock();

  // 可见窗口模式下，等待用户手动完成验证/登录
  if (blocked) {
    const authReady = await waitForManualAuth(page);
    if (authReady) {
      blocked = null;
    }
  }

  if (blocked) {
    return {
      success: false,
      error:
        blocked === 'SMS_VERIFY'
          ? '抖音触发短信验证码验证，请先在浏览器中完成验证后再试'
          : blocked === 'PHONE_VERIFY'
          ? '抖音触发手机号验证，请先在浏览器中完成验证后再试'
          : '抖音要求重新登录，请更新 Cookie',
    };
  }

  // 检测发布失败的明确提示
  const publishFailed = await page.evaluate(() =>
    document.body.innerText.includes('发布评论失败')
  );
  if (publishFailed) {
    return { success: false, error: '抖音提示「发布评论失败」' };
  }

  // 验证：回复文本应出现在当前评论的回复列表中。
  // 短信验证/页面导航可能导致旧的 input Locator 失效，因此优先用页面级检测，
  // 不再依赖特定 input 元素。
  const verifyReplyPublished = async (replyText: string): Promise<boolean> => {
    // 优先检测「已发布」toast
    const hasPublishedToast = await page.evaluate(() =>
      document.body.innerText.includes('已发布')
    );
    if (hasPublishedToast) {
      console.log('[DouyinSender:reply] 检测到「已发布」提示');
      return true;
    }

    // 在页面文本中搜索回复内容，确认它出现在包含「回复」按钮的评论/回复区域内
    return page.evaluate((text) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.includes(text)) continue;

        // 向上找评论/回复容器，确认它在一个包含「回复」按钮的区域内（即已发布）
        let el: HTMLElement | null = node.parentElement;
        while (el && el.tagName !== 'BODY') {
          const hasReply = Array.from(el.querySelectorAll('*')).some(
            (e) => e.textContent?.trim() === '回复'
          );
          if (hasReply) return true;
          el = el.parentElement;
        }
      }
      return false;
    }, replyText);
  };

  // 短信验证后页面可能仍在重渲染，等待稳定
  await page.waitForTimeout(1500);

  let verified = await verifyReplyPublished(content);

  // 如果验证弹窗消失后仍未检测到回复，可能是发送被中断，尝试再发一次
  if (!verified) {
    console.log('[DouyinSender:reply] 验证后未检测到回复，尝试再次发送');
    // input 可能在验证后已失效，重新定位一次
    const freshInput = await locateReplyInput(page, container);
    if (freshInput) {
      await freshInput.fill(content);
      await randomDelay(800, 1500);
      await freshInput.press('Enter');
    } else if (input && (await input.evaluate(() => true).catch(() => false))) {
      await input.fill(content);
      await randomDelay(800, 1500);
      await input.press('Enter');
    } else {
      console.log('[DouyinSender:reply] 无法重新定位输入框，跳过重试');
    }

    await page.waitForTimeout(2500);
    await debugScreenshot(page, 'reply-after-resend');

    const publishFailed2 = await page.evaluate(() =>
      document.body.innerText.includes('发布评论失败')
    );
    if (publishFailed2) {
      return { success: false, error: '抖音提示「发布评论失败」' };
    }

    verified = await verifyReplyPublished(content);
    if (!verified) {
      return {
        success: false,
        error: '点击发送后未检测到回复内容，可能未真正发送成功',
      };
    }
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// 私信
// ---------------------------------------------------------------------------

async function sendDmOperation(
  page: Page,
  params: SendDmParams
): Promise<SendResult> {
  const { videoUrl, authorName, content, commentContent } = params;

  console.log(`[DouyinSender:dm] 打开视频页: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
  await randomDelay(1000, 3000);

  // 登录后弹窗会遮挡评论区，尽早关闭
  await dismissLoginPopups(page);

  // 可见窗口模式下，若弹出登录/验证框，等待用户手动完成
  const authReady = await waitForManualAuth(page);
  if (!authReady) {
    return { success: false, error: '未在可见浏览器窗口中完成登录/验证' };
  }

  // 登录后页面可能跳转到首页，若不在视频页则重新打开
  let currentUrl = page.url();
  console.log(`[DouyinSender:dm] 当前页面: ${currentUrl}`);
  if (!currentUrl.includes('/video/')) {
    console.log(`[DouyinSender:dm] 登录后页面已跳转，重新打开视频页`);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay(1500, 2500);
    currentUrl = page.url();
    console.log(`[DouyinSender:dm] 重新加载后页面: ${currentUrl}`);
  }

  if (currentUrl.includes('login') || currentUrl.includes('verify')) {
    return { success: false, error: 'Cookie 失效或需要登录验证' };
  }

  const container = await findCommentContainer(page, commentContent || authorName);
  if (!container) {
    const screenshot = await debugScreenshot(page, 'dm-not-found').catch(() => '');
    return {
      success: false,
      error: `未找到目标评论内容：${commentContent || authorName}${screenshot ? `（已截图：${screenshot}）` : ''}`,
    };
  }

  // 点击评论作者昵称进入主页。
  // 抖音网页版通常点击昵称才跳转，点头像可能只是展开或不跳转。
  const authorMarkId = `douyin-sender-author-${Date.now()}`;
  const authorFound = await container.evaluate((el, markId) => {
    const scope = el as HTMLElement;

    // 策略 A：找指向用户主页的链接
    const userLink = scope.querySelector('a[href*="/user/"]') as HTMLElement | null;
    if (userLink) {
      userLink.setAttribute(`data-${markId}`, '');
      return true;
    }

    // 策略 B：找头像图片，优先标记图片本身或最近的可点击父级。
    // 抖音有些头像直接绑定点击事件在 img 上。
    const avatarImg = scope.querySelector('img') as HTMLElement | null;
    if (avatarImg) {
      avatarImg.setAttribute(`data-${markId}`, '');
      return true;
    }

    // 策略 C：找作者昵称。昵称通常是头像右侧第一个短文本元素。
    // 文本元素本身可能不可点击，需要向上找到最近的 <a>。
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
    const texts: { node: Text; el: HTMLElement; len: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim() ?? '';
      if (!text) continue;
      const el = node.parentElement as HTMLElement;
      // 排除评论内容（通常较长）和按钮文案
      if (text.length <= 20 && !['回复', '分享'].includes(text)) {
        texts.push({ node: node as Text, el, len: text.length });
      }
    }
    // 优先选最短的文本（昵称通常 2-10 个字）
    texts.sort((a, b) => a.len - b.len);
    if (texts.length > 0) {
      let clickable = texts[0].el;
      while (clickable && clickable.tagName !== 'BODY') {
        if (clickable.tagName === 'A' || clickable.tagName === 'BUTTON') {
          clickable.setAttribute(`data-${markId}`, '');
          return true;
        }
        clickable = clickable.parentElement as HTMLElement;
      }
      // 兜底：直接标记文本元素（即使它不可点击，也用于调试观察）
      texts[0].el.setAttribute(`data-${markId}`, '');
      return true;
    }

    return false;
  }, authorMarkId);

  if (!authorFound) {
    const screenshot = await debugScreenshot(page, 'dm-author-not-found').catch(() => '');
    return {
      success: false,
      error: `未找到评论作者入口${screenshot ? `（已截图：${screenshot}）` : ''}`,
    };
  }

  const authorLink = page.locator(`[data-${authorMarkId}]`).first();
  const authorVisible = await authorLink.isVisible().catch(() => false);
  if (!authorVisible) {
    return { success: false, error: '评论作者入口不可见' };
  }

  const beforeUrl = page.url();

  // 抖音可能在新标签页打开用户主页，需要监听新页面
  const context = page.context();
  const newPagePromise = context
    .waitForEvent('page', { timeout: 5000 })
    .catch(() => null);

  await authorLink.click();
  const newPage = await newPagePromise;
  if (newPage) {
    console.log('[DouyinSender:dm] 检测到新标签页，切换到用户主页');
    await newPage.waitForLoadState('domcontentloaded').catch(() => {});
    page = newPage;
    page.setDefaultTimeout(DEFAULT_TIMEOUT);
  }

  // 等待 URL 变化（跳转主页）或弹窗出现
  let afterClickUrl = page.url();
  let attempts = 0;
  while (afterClickUrl === beforeUrl && attempts < 10) {
    await page.waitForTimeout(500);
    afterClickUrl = page.url();
    attempts++;
  }
  console.log(`[DouyinSender:dm] 点击作者后页面: ${afterClickUrl}`);

  // 点击后可能没跳转到 /user/（比如抖音用弹窗/侧边栏展示主页），截图观察
  await debugScreenshot(page, 'dm-after-author-click');

  // 点击「私信」按钮。抖音用侧边栏展示主页，用 JS 全局搜索更稳。
  await page.waitForTimeout(1500);
  const dmClicked = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent?.trim() === '私信') {
        let el: HTMLElement | null = node.parentElement;
        while (el && el.tagName !== 'BODY') {
          const tag = el.tagName;
          const role = el.getAttribute('role');
          const clickable =
            tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'link';
          if (clickable) {
            el.click();
            return true;
          }
          el = el.parentElement;
        }
      }
    }
    return false;
  });

  if (!dmClicked) {
    const screenshot = await debugScreenshot(page, 'dm-button-not-found').catch(() => '');
    return {
      success: false,
      error: `未找到私信按钮${screenshot ? `（已截图：${screenshot}）` : ''}`,
    };
  }
  console.log('[DouyinSender:dm] 已点击私信按钮');
  await randomDelay(1500, 2500);
  await debugScreenshot(page, 'dm-after-dm-click');

  // 私信输入框：在页面全局找 textarea/contenteditable
  const input = page.locator('textarea, [contenteditable="true"]').filter({ visible: true }).first();
  const inputVisible = await input.isVisible().catch(() => false);
  if (!inputVisible) {
    //  fallback：用 JS 找占位符含「私信」或「消息」的输入框
    const inputFound = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]')
      ) as HTMLElement[];
      for (const el of inputs) {
        const placeholder =
          el.getAttribute('placeholder') ||
          el.getAttribute('aria-label') ||
          el.textContent ||
          '';
        if (placeholder.includes('私信') || placeholder.includes('消息') || placeholder.includes('聊')) {
          el.click();
          el.focus();
          return true;
        }
      }
      // 兜底：找第一个可见的输入框
      for (const el of inputs) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.click();
          el.focus();
          return true;
        }
      }
      return false;
    });
    if (!inputFound) {
      return { success: false, error: '未找到私信输入框' };
    }
  }
  await input.fill(content);
  console.log('[DouyinSender:dm] 填写私信内容');
  await randomDelay(1000, 2000);

  // 发送按钮：优先 JS 点击「发送」文字元素，否则回车
  const sendClicked = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent?.trim() === '发送') {
        let el: HTMLElement | null = node.parentElement;
        while (el && el.tagName !== 'BODY') {
          const tag = el.tagName;
          const role = el.getAttribute('role');
          const clickable =
            tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'link';
          if (clickable) {
            el.click();
            return true;
          }
          el = el.parentElement;
        }
      }
    }
    return false;
  });

  if (sendClicked) {
    console.log('[DouyinSender:dm] 已点击发送按钮');
  } else {
    console.log('[DouyinSender:dm] 未找到发送按钮，尝试回车发送');
    await input.press('Enter');
  }

  await page.waitForTimeout(2500);
  await debugScreenshot(page, 'dm-after-send');

  return { success: true };
}

// ---------------------------------------------------------------------------
// Provider 导出
// ---------------------------------------------------------------------------

function normalizeSendError(error: unknown, context: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Cookie') || message.includes('cookie')) {
    return message;
  }
  if (message.includes('登录') || message.includes('验证') || message.includes('login')) {
    return `登录态异常，请重新配置抖音 Cookie：${message}`;
  }
  if (message.includes('未找到')) {
    return message;
  }
  return `${context}失败：${message}`;
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
      return { success: false, error: normalizeSendError(error, '回复发送') };
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
      return { success: false, error: normalizeSendError(error, '私信发送') };
    }
  },
};
