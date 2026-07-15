/**
 * 用 pg 直连更新抖音 Cookie
 * 用法：npx tsx scripts/debug/update-douyin-cookies-sql.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
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
  const encrypted = encrypt(cookiesString);

  console.log(`读取到 ${parsed.length} 个 Cookie，准备更新用户 ${USER_ID}`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL 未设置');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    console.log('数据库已连接');

    // 检查记录是否存在
    const check = await client.query(
      'SELECT id FROM platform_credentials WHERE "userId" = $1 AND platform = $2',
      [USER_ID, 'DOUYIN']
    );

    if (check.rowCount && check.rowCount > 0) {
      await client.query(
        'UPDATE platform_credentials SET cookies = $1, enabled = true, "updatedAt" = NOW() WHERE "userId" = $2 AND platform = $3',
        [encrypted, USER_ID, 'DOUYIN']
      );
      console.log('已更新现有抖音凭证');
    } else {
      await client.query(
        'INSERT INTO platform_credentials (id, "userId", platform, cookies, enabled, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, true, NOW(), NOW())',
        [USER_ID, 'DOUYIN', encrypted]
      );
      console.log('已创建新抖音凭证');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
