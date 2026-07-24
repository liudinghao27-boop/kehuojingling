import { beforeAll, afterAll } from 'vitest';

// 必须在任何模块加载前设置测试数据库，否则 src/lib/db 会缓存开发库连接。
process.env.DATABASE_URL =
  'postgresql://kehuojingling:kehuojingling@localhost:5432/kehuojingling_test?schema=public';
process.env.NEXTAUTH_SECRET = 'test-secret-do-not-use-in-production';
process.env.AI_API_KEY_ENCRYPTION_KEY = 'test-key-32bytes-for-devx123';

import { prisma as testPrisma } from '@/lib/db';

export { testPrisma as prisma };

/**
 * 清空测试数据库所有业务表。
 * 使用 TRUNCATE ... CASCADE 一次性处理外键依赖，比逐表 deleteMany 更可靠。
 */
export async function clearDatabase() {
  await testPrisma.$executeRaw`
    TRUNCATE TABLE
      "replies",
      "dms",
      "comments",
      "videos",
      "keyword_monitors",
      "sender_accounts",
      "platform_credentials",
      "reply_templates",
      "dm_templates",
      "activities",
      "ai_research_history",
      "users"
    RESTART IDENTITY CASCADE;
  `;
}

beforeAll(async () => {
  await testPrisma.$connect();
});

afterAll(async () => {
  await clearDatabase();
  await testPrisma.$disconnect();
});
