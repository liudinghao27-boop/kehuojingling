import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface RateLimitConfig {
  key: string;
  limit: number;
  window: number; // seconds
}

export async function checkRateLimit(config: RateLimitConfig): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const { key, limit, window } = config;
  const now = Math.floor(Date.now() / 1000);
  const windowKey = Math.floor(now / window);
  const fullKey = `ratelimit:${key}:${windowKey}`;

  const current = await redis.incr(fullKey);
  if (current === 1) {
    await redis.expire(fullKey, window);
  }

  const allowed = current <= limit;
  const remaining = Math.max(0, limit - current);
  const resetAt = (windowKey + 1) * window;

  return { allowed, remaining, resetAt };
}

// 预定义的限制配置
export const rateLimits = {
  reply: { limit: 200, window: 86400 }, // 每日 200 条回复
  dm: { limit: 50, window: 86400 },      // 每日 50 条私信
  scrape: { limit: 100, window: 3600 }, // 每小时 100 次抓取
};
