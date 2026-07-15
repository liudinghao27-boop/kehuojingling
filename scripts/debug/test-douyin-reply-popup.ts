/**
 * 独立测试：验证抖音登录信息弹窗关闭 + 评论区加载
 * 用法：npx tsx scripts/debug/test-douyin-reply-popup.ts
 */
import { chromium, Page, ConsoleMessage } from 'playwright';
import fs from 'fs';
import path from 'path';

const COOKIE_FILE = path.join(process.cwd(), 'logs', 'douyin-sender', 'test-cookies.json');
const VIDEO_URL = 'https://www.douyin.com/video/7661929820783168811';
const DEBUG_DIR = path.join(process.cwd(), 'logs', 'douyin-sender');

function ensureDir() {
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

async function screenshot(page: Page, name: string) {
  ensureDir();
  const p = path.join(DEBUG_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`截图: ${p}`);
  return p;
}

async function randomDelay(min: number, max: number) {
  await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

async function dismissLoginPopups(page: Page) {
  const dialog = page
    .locator('div[role="dialog"], div[class*="dialog"], div[class*="modal"]')
    .filter({ hasText: '是否保存登录信息' })
    .first();

  const visible = await dialog.isVisible().catch(() => false);
  if (!visible) return false;

  console.log('检测到保存登录信息弹窗');
  const saveBtn = dialog.locator('text=保存').first();
  const cancelBtn = dialog.locator('text=取消').first();

  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
  } else if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click();
  }
  await randomDelay(1200, 1800);
  return true;
}

type CookieItem = {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

async function main() {
  if (!fs.existsSync(COOKIE_FILE)) {
    console.error('Cookie 文件不存在:', COOKIE_FILE);
    process.exit(1);
  }

  const rawCookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8')) as CookieItem[];
  const cookies = rawCookies
    .map((item) => ({
      name: String(item.name ?? ''),
      value: String(item.value ?? ''),
      domain: String(item.domain ?? '.douyin.com'),
      path: String(item.path ?? '/'),
      secure: Boolean(item.secure),
      httpOnly: Boolean(item.httpOnly),
      sameSite: ['Strict', 'Lax', 'None'].includes(item.sameSite ?? '') ? item.sameSite! : 'Lax',
    }))
    .filter((c) => c.name);

  console.log(`加载 ${cookies.length} 个 Cookie`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    context.setDefaultTimeout(30_000);
    await context.addCookies(cookies);

    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') console.log('[page:error]', msg.text());
    });

    console.log('打开视频页:', VIDEO_URL);
    await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await randomDelay(2000, 3000);

    await screenshot(page, 'step1-after-goto');
    await dismissLoginPopups(page);
    await screenshot(page, 'step2-after-dismiss');

    // 滚动到评论区
    await page.evaluate(() => {
      const el = document.querySelector('[class*="comment"], [class*="Comment"], [data-e2e="comment-list"]');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      else window.scrollTo(0, document.body.scrollHeight);
    });
    await randomDelay(2000, 3000);
    await screenshot(page, 'step3-after-scroll');

    // 等待回复按钮出现
    try {
      await page.waitForSelector('text=回复', { timeout: 15_000 });
      console.log('评论区已加载，找到「回复」按钮');
    } catch {
      console.log('15s 内未找到「回复」按钮');
    }

    // 统计评论数量
    const replyBtns = await page.locator('text=回复').count();
    console.log(`页面中「回复」按钮数量: ${replyBtns}`);

    // 提取前几条评论文本
    const comments = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('div, span, p'));
      return nodes
        .filter((n) => n.textContent?.includes('回复'))
        .slice(0, 5)
        .map((n) => ({
          tag: n.tagName,
          text: n.textContent?.slice(0, 80),
        }));
    });
    console.log('前几条含「回复」的元素:', JSON.stringify(comments, null, 2));

    await screenshot(page, 'step4-final');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
