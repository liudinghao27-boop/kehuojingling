import { chromium, Page } from 'playwright';
import { Platform } from '@prisma/client';
import { encrypt } from '@/lib/encryption';
import { prisma } from '@/lib/db';
import { randomDelay } from '@/lib/sender/utils';
import { cleanupSession } from './sessions';
import { QrLoginSession } from './types';

const LOGIN_URL = 'https://www.douyin.com/';
const WATCH_DURATION_MS = 300_000;
const POLL_INTERVAL_MS = 2_500;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 启动抖音扫码登录流程。
 *
 * 1. 启动 Playwright Chromium
 * 2. 访问抖音首页
 * 3. 点击登录入口打开登录弹窗
 * 4. 提取二维码 Data URL
 * 5. 后台启动登录状态监控
 *
 * 抖音 UI 可能变化，选择器需随页面调整。
 */
export async function startDouyinQrLogin(
  session: QrLoginSession
): Promise<string> {
  try {
    // 反检测参数：隐藏自动化特征
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });
    session.browser = browser;

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    // 注入脚本隐藏 webdriver 等自动化标记
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      // @ts-expect-error Playwright 注入需要覆盖 window.chrome 以隐藏自动化标记
      window.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    session.page = page;

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await randomDelay(2_000, 4_000);

    // 检测是否出现安全验证
    if (await isCaptchaPresent(page)) {
      throw new Error('抖音检测到安全验证，请稍后重试或换用手动输入 Cookie');
    }

    // 如果首页出现登录入口，点击以打开登录弹窗
    await clickLoginButtonIfPresent(page);
    await randomDelay(2_000, 3_000);

    // 再次检测安全验证
    if (await isCaptchaPresent(page)) {
      throw new Error('抖音检测到安全验证，请稍后重试或换用手动输入 Cookie');
    }

    // 二维码可能需要时间渲染，尝试多次提取
    let qrCodeDataUrl: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      qrCodeDataUrl = await extractQrCodeDataUrl(page);
      if (qrCodeDataUrl) break;
      await randomDelay(1_000, 2_000);
    }

    if (!qrCodeDataUrl) {
      throw new Error('无法获取抖音登录二维码');
    }

    session.qrCodeDataUrl = qrCodeDataUrl;

    // 后台启动登录状态监控，不阻塞返回二维码
    watchDouyinLogin(session).catch((error) => {
      console.error(
        `[QrLogin] watchDouyinLogin failed for ${session.sessionId}:`,
        error
      );
    });

    return qrCodeDataUrl;
  } catch (error) {
    session.error = getErrorMessage(error);
    session.status = 'error';
    await cleanupSession(session);
    throw error;
  }
}

/**
 * 尝试点击页面或 iframe 中的登录按钮，打开登录弹窗。
 * 抖音 UI 可能变化，选择器需随页面调整。
 */
async function clickLoginButtonIfPresent(page: Page): Promise<void> {
  const loginButtonSelectors = [
    'button:has-text("登录")',
    'div:has-text("登录")',
    'a:has-text("登录")',
    '[data-e2e="login-button"]',
    '[data-e2e="login-btn"]',
    '[class*="login-button"]',
    '[class*="login-btn"]',
  ];

  for (const frame of page.frames()) {
    for (const selector of loginButtonSelectors) {
      const locator = frame.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) {
        await locator.click();
        return;
      }
    }
  }
}

/**
 * 尝试从页面或 iframe 中提取二维码 Data URL。
 *
 * 策略：
 * 1. 查找 <img>，如果 src 已是 data URL 则直接使用；否则绘制到 canvas 生成 data URL。
 * 2. 查找 <canvas>，调用 toDataURL()。
 * 3. 对登录弹窗或二维码区域截图并转 base64 data URL。
 *
 * 抖音 UI 可能变化，选择器需随页面调整。
 */
export async function extractQrCodeDataUrl(page: Page): Promise<string | null> {
  const imgDataUrl = await extractFromImg(page);
  if (imgDataUrl) return imgDataUrl;

  const canvasDataUrl = await extractFromCanvas(page);
  if (canvasDataUrl) return canvasDataUrl;

  return await extractFromScreenshot(page);
}

async function extractFromImg(page: Page): Promise<string | null> {
  // 注意：不要用 src*="qr" 这类宽泛选择器，抖音页面可能有游戏/视频缩略图误匹配
  const selectors = [
    '.qrcode img',
    '.login-qrcode img',
    '[class*="qrcode"] img',
    '[class*="qr-code"] img',
    '[class*="login-qrcode"] img',
    '[data-e2e="login-qrcode"] img',
    '[data-e2e="qrcode"] img',
  ];

  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) continue;

      try {
        const result = await frame.evaluate((sel) => {
          const img = document.querySelector(sel) as HTMLImageElement | null;
          if (!img || !img.complete || img.naturalWidth === 0) {
            return null;
          }

          // 二维码必须是正方形，宽高差异过大则不是二维码
          const ratio = img.naturalWidth / img.naturalHeight;
          if (ratio < 0.8 || ratio > 1.2) {
            return null;
          }

          let dataUrl: string | null = null;
          if (img.src.startsWith('data:')) {
            dataUrl = img.src;
          } else {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              if (!ctx) return null;
              ctx.drawImage(img, 0, 0);
              dataUrl = canvas.toDataURL('image/png');
            } catch {
              return null;
            }
          }

          return {
            dataUrl,
            width: img.naturalWidth,
            height: img.naturalHeight,
          };
        }, selector);

        if (result?.dataUrl) {
          console.log(
            `[QrLogin] QR extracted from img: ${selector} (${result.width}x${result.height})`
          );
          return result.dataUrl;
        }
      } catch {
        // 跨域或执行失败，尝试下一个
      }
    }
  }

  return null;
}

async function extractFromCanvas(page: Page): Promise<string | null> {
  for (const frame of page.frames()) {
    const canvases = frame.locator('canvas');
    const count = await canvases.count().catch(() => 0);

    for (let i = 0; i < count; i++) {
      const locator = canvases.nth(i);
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) continue;

      try {
        const box = await locator.boundingBox();
        if (!box || box.width === 0 || box.height === 0) continue;

        // 二维码画布应为正方形，且尺寸适中（100px ~ 400px）
        const ratio = box.width / box.height;
        if (ratio < 0.8 || ratio > 1.2) continue;
        if (box.width < 100 || box.width > 400) continue;

        const dataUrl = await frame.evaluate((index) => {
          const canvas = document.querySelectorAll('canvas')[index] as
            | HTMLCanvasElement
            | undefined;
          if (!canvas) return null;
          return canvas.toDataURL('image/png');
        }, i);

        if (dataUrl) {
          console.log(
            `[QrLogin] QR extracted from canvas: ${Math.round(
              box.width
            )}x${Math.round(box.height)}`
          );
          return dataUrl;
        }
      } catch {
        // 跨域或执行失败，尝试下一个
      }
    }
  }

  return null;
}

async function extractFromScreenshot(page: Page): Promise<string | null> {
  // 优先精确匹配二维码容器（小尺寸、正方形）
  const qrContainerSelectors = [
    '[class*="qrcode"]',
    '[class*="qr-code"]',
    '[class*="login-qrcode"]',
    '[data-e2e="login-qrcode"]',
    '[data-e2e="qrcode"]',
  ];

  try {
    for (const frame of page.frames()) {
      // 先尝试找二维码容器，通常是比较小的正方形区域
      for (const selector of qrContainerSelectors) {
        const locator = frame.locator(selector).first();
        const visible = await locator.isVisible().catch(() => false);
        if (!visible) continue;

        try {
          const box = await locator.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            // 如果容器比较大（> 500px），说明可能匹配到了外层容器，跳过
            if (box.width <= 500 && box.height <= 500) {
              const buffer = await locator.screenshot({ type: 'png' });
              console.log(
                `[QrLogin] QR screenshot from container: ${selector} (${Math.round(
                  box.width
                )}x${Math.round(box.height)})`
              );
              return `data:image/png;base64,${buffer.toString('base64')}`;
            }
          }
        } catch {
          // 忽略单个选择器失败
        }
      }

      // 如果没找到精确容器，尝试登录弹窗容器
      const popupSelectors = [
        '[class*="login-popup"]',
        '[class*="login-dialog"]',
        '[class*="login-modal"]',
        '[class*="login-panel"]',
        '[class*="login-container"]',
      ];

      for (const selector of popupSelectors) {
        const locator = frame.locator(selector).first();
        const visible = await locator.isVisible().catch(() => false);
        if (!visible) continue;

        try {
          const box = await locator.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            const buffer = await locator.screenshot({ type: 'png' });
            console.log(
              `[QrLogin] QR screenshot from popup: ${selector} (${Math.round(
                box.width
              )}x${Math.round(box.height)})`
            );
            return `data:image/png;base64,${buffer.toString('base64')}`;
          }
        } catch {
          // 忽略单个选择器失败
        }
      }
    }

    // 最后兜底：截取页面中心区域（登录弹窗一般在中间）
    const viewport = page.viewportSize();
    if (viewport) {
      const size = Math.min(viewport.width, viewport.height, 600);
      const x = Math.max(0, (viewport.width - size) / 2);
      const y = Math.max(0, (viewport.height - size) / 2);
      const buffer = await page.screenshot({
        type: 'png',
        clip: { x, y, width: size, height: size },
      });
      console.log('[QrLogin] QR screenshot from viewport center');
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }

    return null;
  } catch (error) {
    console.error('[QrLogin] Screenshot failed:', error);
    return null;
  }
}

/**
 * 循环检测抖音登录状态。
 *
 * - 最多持续 5 分钟
 * - 每 2-3 秒检测一次
 * - 每 8-12 秒刷新一次二维码，防止抖音自动刷新导致客户端扫到过期码
 * - 检测到手机确认后刷新页面，触发登录态跳转
 * - 登录成功后保存 Cookie 并清理会话
 * - 超时或异常时更新状态并清理会话
 */
export async function watchDouyinLogin(session: QrLoginSession): Promise<void> {
  const { page } = session;
  if (!page) {
    throw new Error('Session page is missing');
  }

  try {
    const startTime = Date.now();
    let lastQrRefresh = startTime;
    let hasRefreshedAfterScan = false;

    while (Date.now() - startTime < WATCH_DURATION_MS) {
      if (await isLoggedIn(page)) {
        await saveCookies(session);
        session.status = 'success';
        // 保留几秒 success 状态，让前端轮询能捕获到，再清理会话
        await randomDelay(5_000, 5_000);
        await cleanupSession(session);
        return;
      }

      // 检测扫码后等待手机确认的状态
      if (session.status === 'pending' && (await isQrScanned(page))) {
        session.status = 'scanned';
      }

      // 手机确认后，抖音网页有时不会自动跳转，需要刷新页面触发登录态
      if (session.status === 'scanned' && !hasRefreshedAfterScan) {
        console.log('[QrLogin] Phone confirmed, refreshing page to trigger login');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await randomDelay(2_000, 3_000);
        hasRefreshedAfterScan = true;
        continue;
      }

      // 定期刷新二维码：仅在登录弹窗仍显示时刷新，避免登录成功后截到主页视频
      if (Date.now() - lastQrRefresh > 10_000 && (await isLoginPopupVisible(page))) {
        const newQr = await extractQrCodeDataUrl(page);
        if (newQr && newQr !== session.qrCodeDataUrl) {
          session.qrCodeDataUrl = newQr;
          console.log('[QrLogin] QR code refreshed');
        }
        lastQrRefresh = Date.now();
      }

      await randomDelay(POLL_INTERVAL_MS, POLL_INTERVAL_MS + 1_000);
    }

    session.status = 'expired';
    await cleanupSession(session);
  } catch (error) {
    session.error = getErrorMessage(error);
    session.status = 'error';
    await cleanupSession(session);
  }
}

/**
 * 检测当前页面是否已登录。
 *
 * 判断依据：
 * - 页面 URL 不在登录相关路径
 * - 且登录弹窗已关闭
 * - 且出现强登录态标识（用户头像、发布按钮等）
 *
 * 抖音 UI 可能变化，选择器需随页面调整。
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  const isLoginUrl = url.includes('/login') || url.includes('/passport');
  if (isLoginUrl) return false;

  // 如果登录弹窗还在，说明没登录
  const loginPopupVisible = await isLoginPopupVisible(page);
  if (loginPopupVisible) return false;

  // 强登录态标识：必须是当前登录用户的头像，不能用通用的 [class*="avatar"]
  // 避免把推荐视频里的创作者头像误判为已登录
  const strongIndicators = [
    '[data-e2e="user-avatar"]',
    '[data-e2e="avatar"]',
    'img[alt*="头像"]',
    'img[alt="avatar"]',
  ];

  for (const selector of strongIndicators) {
    const locator = page.locator(selector).first();
    const visible = await locator.isVisible().catch(() => false);
    if (visible) return true;
  }

  // 兜底：页面上同时出现「发布视频」和「消息」才认为登录
  const publishVisible = await page
    .locator('text=发布视频')
    .first()
    .isVisible()
    .catch(() => false);
  const msgVisible = await page
    .locator('text=消息')
    .first()
    .isVisible()
    .catch(() => false);

  return publishVisible && msgVisible;
}

async function isLoginPopupVisible(page: Page): Promise<boolean> {
  const popupSelectors = [
    '[class*="login-popup"]',
    '[class*="login-dialog"]',
    '[class*="login-modal"]',
    '[class*="login-panel"]',
    '[class*="login-container"]',
  ];

  for (const frame of page.frames()) {
    for (const selector of popupSelectors) {
      const locator = frame.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return true;
    }
  }

  return false;
}

/**
 * 检测抖音是否弹出安全验证（滑块拼图、点选验证等）。
 */
async function isCaptchaPresent(page: Page): Promise<boolean> {
  const captchaIndicators = [
    'text=请完成下列验证后继续',
    'text=请完成验证',
    'text=拖动滑块',
    'text=请点击',
    '[class*="captcha"]',
    '[class*="verify"]',
    '[class*="slider"]',
    '[data-e2e="captcha"]',
    'img[src*="captcha"]',
  ];

  for (const frame of page.frames()) {
    for (const selector of captchaIndicators) {
      const locator = frame.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) {
        console.log('[QrLogin] CAPTCHA detected:', selector);
        return true;
      }
    }
  }

  return false;
}

async function isQrScanned(page: Page): Promise<boolean> {
  const scannedTexts = ['请在手机上确认', '已扫描', '扫码成功', '请在 App 中确认'];

  for (const frame of page.frames()) {
    try {
      const bodyText = await frame
        .locator('body')
        .innerText({ timeout: 5_000 })
        .catch(() => '');
      if (scannedTexts.some((text) => bodyText.includes(text))) {
        return true;
      }
    } catch {
      // 忽略 frame 访问失败
    }
  }

  return false;
}

/**
 * 保存 Cookie 到数据库。
 *
 * 1. 从 browser context 获取所有 Cookie
 * 2. JSON.stringify
 * 3. encrypt 加密
 * 4. prisma.platformCredential.upsert（userId_platform 复合唯一键）
 */
export async function saveCookies(session: QrLoginSession): Promise<void> {
  const { page, userId, platform } = session;
  if (!page) {
    throw new Error('Session page is missing');
  }

  const context = page.context();
  const cookies = await context.cookies();
  const cookiesJson = JSON.stringify(cookies);
  const encryptedCookies = encrypt(cookiesJson);

  await prisma.platformCredential.upsert({
    where: {
      userId_platform: {
        userId,
        platform: platform as Platform,
      },
    },
    update: {
      cookies: encryptedCookies,
    },
    create: {
      userId,
      platform: platform as Platform,
      cookies: encryptedCookies,
    },
  });

  console.log(
    `[QrLogin] Saved cookies for user ${userId} platform ${platform}`
  );
}
