/**
 * 行为拟人化工具
 *
 * 抖音等平台会基于行为特征（瞬间 fill、无鼠标轨迹）识别自动化脚本，
 * 这里用逐字输入 + 随机滚动/鼠标移动模拟真人操作节奏。
 * 等待统一复用 utils.randomDelay，测试中 vi.mock('../utils') 可将其变为 no-op。
 */

import type { Locator, Page } from 'playwright';
import { randomDelay } from './utils';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 替换 Locator.fill 的拟人化输入：
 * fill 是一次性注入 value，不触发逐键事件，容易被风控识别；
 * 这里改为逐字输入，每字符间隔 50-200ms，并有 5% 概率停顿 300-800ms（模拟思考）。
 */
export async function humanType(locator: Locator, text: string): Promise<void> {
  // 真人输入前会先点击输入框聚焦
  await locator.click();

  for (const char of text) {
    await locator.pressSequentially(char, { delay: randomInt(50, 200) });
    // 小概率长停顿，模拟真人边想边打
    if (Math.random() < 0.05) {
      await randomDelay(300, 800);
    }
  }
}

/**
 * 打开页面后模拟真人浏览：随机滚动 + 随机鼠标移动。
 * 无任何浏览行为直接操作评论区是典型的脚本特征。
 */
export async function simulateHumanBrowsing(page: Page): Promise<void> {
  // 随机向下滚动 2-5 次，模拟浏览内容
  const scrollTimes = randomInt(2, 5);
  for (let i = 0; i < scrollTimes; i++) {
    await page.mouse.wheel(0, randomInt(300, 800));
    await randomDelay(800, 2000);
  }

  // 随机移动鼠标 2-4 次；steps >= 10 让轨迹是连续路径而不是瞬移
  const moveTimes = randomInt(2, 4);
  for (let i = 0; i < moveTimes; i++) {
    await page.mouse.move(randomInt(100, 1100), randomInt(100, 700), {
      steps: randomInt(10, 25),
    });
    await randomDelay(200, 500);
  }
}
