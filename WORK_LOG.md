# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-15

## 本次完成

### 核心 API 测试覆盖
- 选型：**Vitest** + 真实 PostgreSQL 测试库 `kehuojingling_test`
- 新增配置：
  - `vitest.config.ts`：路径 alias、`fileParallelism: false`、测试数据库环境变量
  - `package.json`：`npm test` / `npm run test:watch` 脚本
- 新增测试基础设施：
  - `src/lib/test/setup.ts`：测试库连接、全局 `clearDatabase`
  - `src/lib/test/factories.ts`：`createUser` / `createVideo` / `createComment`
- 新增 API 测试（共 27 个用例）：
  - `src/app/api/comments/route.test.ts`（10 个）：认证、分页、videoId/status/intent/noise/关键词过滤、用户隔离
  - `src/app/api/ai/analyze/route.test.ts`（9 个）：POST 单条分析、commentId 更新、阈值判断；GET 批量分析、NEW 状态过滤
  - `src/app/api/scrape/comments/route.test.ts`（8 个）：参数校验、URL 解析、抓取并保存高意向评论、过滤低意向/噪音、GET 列表
- Mock 策略：
  - `next-auth` 的 `getServerSession`
  - `@/lib/ai/noise`、`@/lib/ai/intent`
  - `@/lib/scraper/douyin`
- CI 更新：
  - `.github/workflows/deploy.yml` 添加 PostgreSQL service
  - 设置 `DATABASE_URL`、先 `prisma db push` 再跑测试
  - 移除 `continue-on-error: true`

### 验证
- `npm test`：27 个用例全部通过
- `npm run lint`：通过
- `npx tsc --noEmit`：通过
- `npm run build`：通过

## 当前运行状态
- 获客精灵：`http://localhost:3000` ✅
- 抓取服务：`http://localhost:8000` ✅
- 本地数据库：`localhost:5432` ✅
- 本地 Redis：`localhost:6379` ✅
- 测试数据库：`kehuojingling_test` ✅

## 开发命令

```bash
# 启动本地数据库和 Redis
cd /e/ai/YJ-HUOKE && docker compose up -d

# 一键启动 Next.js + 抓取服务
cd /e/ai/YJ-HUOKE && npm run dev:all

# 运行测试
cd /e/ai/YJ-HUOKE && npm test

# 如需单独启动
cd /e/ai/YJ-HUOKE && npm run dev:clean       # 仅 Next.js
cd /e/ai/YJ-HUOKE && npm run dev:scraper     # 仅抓取服务
```

## 已知问题 / 后续
- 抖音自动回复/私信依赖真实 Cookie 和 Playwright，生产需单独维护
- 抓取服务需独立部署，生产修改 `SCRAPER_API_URL`
- 建议后续：两端口整合、AI 获客助手热词研究功能增强
