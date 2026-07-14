import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 创建 PostgreSQL 连接池
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  max: 10,
  // 长时间闲置后连接被服务端关闭会导致下次请求卡住，
  // 保持连接存活并避免从池中驱逐空闲连接，减少重连握手耗时。
  idleTimeoutMillis: 0,
  connectionTimeoutMillis: 8000,
  keepAlive: true,
});
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
