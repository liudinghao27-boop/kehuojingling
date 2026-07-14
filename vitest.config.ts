import { defineConfig } from 'vitest/config';
import path from 'path';

// 在配置加载阶段就固定测试环境变量，确保 src/lib/db 等模块在导入时能拿到测试库地址。
process.env.DATABASE_URL =
  'postgresql://kehuojingling:kehuojingling@localhost:5432/kehuojingling_test?schema=public';
process.env.NEXTAUTH_SECRET = 'test-secret-do-not-use-in-production';
process.env.AI_API_KEY_ENCRYPTION_KEY = 'test-key-32bytes-for-devx123';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/lib/test/setup.ts'],
    // 多个测试文件共享同一个测试数据库，避免并发清理互相干扰。
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
