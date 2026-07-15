/**
 * 调试抖音回复按钮 DOM 结构
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const COOKIE_FILE = path.join(process.cwd(), 'logs', 'douyin-sender', 'test-cookies.json');

async function randomDelay(min: number, max: number) {
  await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
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

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies(cookies);
    const page = await context.newPage();

    await page.goto('https://v.douyin.com/fb69V8PQhFI/', { waitUntil: 'domcontentloaded' });
    await randomDelay(3000, 4000);

    // 关闭登录信息弹窗
    const dialog = page.locator('div[role="dialog"], div[class*="dialog"], div[class*="modal"]').filter({ hasText: '是否保存登录信息' }).first();
    if (await dialog.isVisible().catch(() => false)) {
      const saveBtn = dialog.locator('text=保存').first();
      if (await saveBtn.isVisible().catch(() => false)) await saveBtn.click();
      await randomDelay(1000, 1500);
    }

    // 滚动到评论区
    await page.evaluate(() => {
      const el = document.querySelector('[class*="comment"], [class*="Comment"], [data-e2e="comment-list"]');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await randomDelay(1500, 2500);

    // 用 JS 找到评论容器
    const keyword = '真便宜！也就白爷一次商K的钱买一辆车……';
    const markId = `douyin-debug-${Date.now()}`;
    await page.evaluate(
      ({ keyword, markId }) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.includes(keyword)) continue;
          let el: HTMLElement | null = node.parentElement;
          while (el && el.tagName !== 'BODY') {
            const hasReply = Array.from(el.querySelectorAll('*')).some((e) => e.textContent?.trim() === '回复');
            const rect = el.getBoundingClientRect();
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

    const container = page.locator(`[data-${markId}]`).first();
    if (!(await container.isVisible().catch(() => false))) {
      console.log('未找到评论容器');
      return;
    }

    // 点击回复
    await container.locator('text=回复').first().click();
    await randomDelay(1500, 2500);

    // 找到输入框
    const inputs = page.locator('textarea, [contenteditable="true"]').filter({ visible: true });
    const count = await inputs.count();
    let input = inputs.last();
    for (let i = 0; i < count; i++) {
      const candidate = inputs.nth(i);
      const ph = (await candidate.getAttribute('placeholder').catch(() => '')) ?? '';
      if (ph.includes('回复')) {
        input = candidate;
        break;
      }
    }

    await input.fill('谢谢支持！店里1万到10万的车都有，车况精品，有空来转转呗~');
    await randomDelay(1000, 1500);

    await page.screenshot({ path: path.join(process.cwd(), 'logs', 'douyin-sender', 'debug-reply-filled.png'), fullPage: false });

    // 输出输入框父级 HTML 结构
    const html = await input.evaluate((el) => {
      let html = '';
      let cur: Element | null = el;
      for (let i = 0; i < 4 && cur; i++) {
        html += `\n--- level ${i} ---\n`;
        html += cur.outerHTML.slice(0, 2000);
        cur = cur.parentElement;
      }
      return html;
    });
    fs.writeFileSync(path.join(process.cwd(), 'logs', 'douyin-sender', 'debug-reply-html.txt'), html);

    // 输出输入框周围所有可点击元素
    const clickableInfo = await page.evaluate(() => {
      const input = document.querySelector('textarea, [contenteditable="true"]') as HTMLElement | null;
      if (!input) return [];
      const rect = input.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const all = Array.from(document.querySelectorAll('*'));
      return all
        .filter((el) => {
          const style = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const near = Math.abs(r.left + r.width / 2 - centerX) < 300 && Math.abs(r.top + r.height / 2 - centerY) < 100;
          const clickable =
            style.cursor === 'pointer' ||
            el.tagName === 'BUTTON' ||
            el.getAttribute('role') === 'button' ||
            (el as HTMLElement).onclick !== null;
          return near && clickable;
        })
        .map((el) => ({
          tag: el.tagName,
          class: el.className?.slice(0, 100),
          text: el.textContent?.slice(0, 50),
          rect: el.getBoundingClientRect().toString(),
        }));
    });
    fs.writeFileSync(
      path.join(process.cwd(), 'logs', 'douyin-sender', 'debug-reply-clickables.json'),
      JSON.stringify(clickableInfo, null, 2)
    );

    console.log('调试信息已保存到 logs/douyin-sender/');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
