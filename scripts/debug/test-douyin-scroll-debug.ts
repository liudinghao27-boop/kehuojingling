/**
 * 调试抖音页面的滚动行为
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const COOKIE_FILE = path.join(process.cwd(), 'logs', 'douyin-sender', 'test-cookies.json');
const VIDEO_URL = 'https://www.douyin.com/video/7661929820783168811';

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

    await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await randomDelay(3000, 4000);

    type ScrollableInfo = {
      tag: string;
      cls: string;
      id: string;
      sh: number;
      ch: number;
      st: number;
    };

    const info = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const out: ScrollableInfo[] = [];
      for (const el of all) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const overflow = style.overflow;
        const isScroll = (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight;
        if (isScroll) {
          out.push({
            tag: el.tagName,
            cls: (el.className || '').slice(0, 100),
            id: el.id,
            sh: el.scrollHeight,
            ch: el.clientHeight,
            st: el.scrollTop,
          });
          if (out.length >= 10) break;
        }
      }
      return {
        bodySH: document.body.scrollHeight,
        htmlSH: document.documentElement.scrollHeight,
        winH: window.innerHeight,
        winY: window.scrollY,
        scrollables: out,
      };
    });
    console.log('初始滚动信息:', JSON.stringify(info, null, 2));

    await page.evaluate(() => { window.scrollBy(0, 1000); });
    await randomDelay(2000, 2500);
    const afterBy = await page.evaluate(() => ({ winY: window.scrollY, bodySH: document.body.scrollHeight }));
    console.log('window.scrollBy(0,1000) 后:', afterBy);

    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    await randomDelay(2000, 2500);
    const afterTo = await page.evaluate(() => ({ winY: window.scrollY, bodySH: document.body.scrollHeight }));
    console.log('window.scrollTo(bottom) 后:', afterTo);

    await page.mouse.move(640, 600);
    await page.mouse.wheel(0, 2000);
    await randomDelay(2000, 2500);
    const afterWheel = await page.evaluate(() => ({ winY: window.scrollY, bodySH: document.body.scrollHeight }));
    console.log('mouse.wheel 后:', afterWheel);

    if (info.scrollables.length > 0) {
      const first = info.scrollables[0];
      const selector = first.id ? `#${first.id}` : (first.cls ? `.${first.cls.split(' ')[0]}` : first.tag);
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) (el as HTMLElement).scrollTop = el.scrollHeight;
      }, selector);
      await randomDelay(2000, 2500);
      const afterEl = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return { sel, st: el?.scrollTop, sh: el?.scrollHeight };
      }, selector);
      console.log('元素滚动后:', afterEl);
    }

    await page.screenshot({ path: path.join(process.cwd(), 'logs', 'douyin-sender', 'scroll-debug-final.png'), fullPage: true });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
