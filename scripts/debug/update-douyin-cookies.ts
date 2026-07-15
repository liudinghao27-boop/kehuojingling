/**
 * 把 logs/douyin-sender/test-cookies.json 中的新 Cookie 更新到数据库
 * 用法：npx tsx scripts/debug/update-douyin-cookies.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/lib/db';
import { encrypt } from '../../src/lib/encryption';

const COOKIE_FILE = path.join(process.cwd(), 'logs', 'douyin-sender', 'test-cookies.json');
const USER_ID = 'cmrgi0kn000006crb9tdu14qa';

async function main() {
  if (!fs.existsSync(COOKIE_FILE)) {
    console.error('Cookie 文件不存在:', COOKIE_FILE);
    process.exit(1);
  }

  const rawCookies = fs.readFileSync(COOKIE_FILE, 'utf-8');
  const parsed = JSON.parse(rawCookies);
  const cookiesString = JSON.stringify(parsed);

  console.log(`读取到 ${parsed.length} 个 Cookie，准备更新用户 ${USER_ID} 的抖音凭证`);

  const encrypted = encrypt(cookiesString);

  const credential = await prisma.platformCredential.upsert({
    where: {
      userId_platform: {
        userId: USER_ID,
        platform: 'DOUYIN',
      },
    },
    update: {
      cookies: encrypted,
      enabled: true,
    },
    create: {
      userId: USER_ID,
      platform: 'DOUYIN',
      cookies: encrypted,
      enabled: true,
    },
  });

  console.log('抖音 Cookie 已更新到数据库:', {
    id: credential.id,
    platform: credential.platform,
    enabled: credential.enabled,
    updatedAt: credential.updatedAt.toISOString(),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
