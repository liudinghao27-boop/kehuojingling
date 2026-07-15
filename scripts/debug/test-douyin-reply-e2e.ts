/**
 * 端到端测试：调用真实的抖音 sender provider 回复指定评论
 * 用法：npx tsx scripts/debug/test-douyin-reply-e2e.ts
 */
import { douyinProvider } from '../../src/lib/sender/providers/douyin';
import fs from 'fs';
import path from 'path';

const COOKIE_FILE = path.join(process.cwd(), 'logs', 'douyin-sender', 'test-cookies.json');

async function main() {
  if (!fs.existsSync(COOKIE_FILE)) {
    console.error('Cookie 文件不存在:', COOKIE_FILE);
    process.exit(1);
  }

  const cookies = fs.readFileSync(COOKIE_FILE, 'utf-8');

  const result = await douyinProvider.sendReply({
    userId: 'test-user',
    platform: 'DOUYIN',
    videoUrl: 'https://v.douyin.com/fb69V8PQhFI/',
    commentId: 'cmrlihzb900111krbl35xlvcy',
    authorName: '……',
    commentContent: '真便宜！也就白爷一次商K的钱买一辆车……[赞][赞][赞]',
    content: '谢谢支持！店里1万到10万的车都有，车况精品，有空来转转呗~',
    credentials: {
      platform: 'DOUYIN',
      cookies,
    },
  });

  console.log('结果:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
