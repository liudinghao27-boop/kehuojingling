# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-15

## 本次完成

### 两端口整合优化（Next.js ↔ 抓取服务）
- 代理路由：
  - 新增 `src/app/api/scraper/[...path]/route.ts`
  - 认证后可把 `/api/scraper/*` 透传给 `SCRAPER_API_URL`，前端/后端只感知 3000 端口
  - 抓取服务不可达时返回 502 并附带友好提示
- 抓取客户端：
  - `src/lib/scraper/douyin.ts` 新增 `getScraperApiUrl()` 与 `buildScraperUrl()`
  - `scrapeCommentsReal` 默认走 `/api/scraper` 代理，保留 `http://localhost:8000` 直连回退
  - 代理模式下路径为 `/api/scraper/hybrid/...`，直连模式下路径为 `/api/hybrid/...`
- 启动脚本：
  - `scripts/dev-clean.js`：启动前探测 PostgreSQL/Redis，缺失时给出明确提示
  - `scripts/start-scraper.js`：Windows 下增强 `SIGINT` 转发与崩溃日志提示
  - `package.json`：新增 `start:all` 用于生产环境一键启动
- 配置与文档：
  - `.env.example`：默认 `SCRAPER_API_URL=/api/scraper`
  - `ENV_CONFIG.md`：补充代理模式说明与部署建议
- 测试：
  - `src/app/api/scraper/[...path]/route.test.ts`：转发、鉴权、错误透传测试
  - `src/lib/scraper/douyin.test.ts`：URL 解析、代理/直连路径切换测试

### 验证
- `npm test`：61 个用例全部通过
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

# 一键启动 Next.js + 抓取服务（开发）
cd /e/ai/YJ-HUOKE && npm run dev:all

# 一键启动 Next.js + 抓取服务（生产）
cd /e/ai/YJ-HUOKE && npm run start:all

# 运行测试
cd /e/ai/YJ-HUOKE && npm test

# 如需单独启动
cd /e/ai/YJ-HUOKE && npm run dev:clean       # 仅 Next.js
cd /e/ai/YJ-HUOKE && npm run dev:scraper     # 仅抓取服务
```

## 已知问题 / 后续
- 抖音自动回复/私信依赖真实 Cookie 和 Playwright，生产需单独维护
- 抓取服务需独立部署，生产可修改 `SCRAPER_API_URL` 为公网地址，或配合反向代理保持 `/api/scraper`
- 监控词库当前仅保存，尚未与视频/评论监控模块打通，可作为下一阶段桥接点

## 下次继续记录
- **当前分支**：`main`
- **最近两次提交**：
  1. `c004c57 docs: add checkpoint for next session`
  2. `535726d feat: AI 获客助手热词评分与监控桥接`
- **已启用测试框架**：Vitest + `kehuojingling_test` 测试库
- **推荐继续方向**：
  1. 打通监控词库 ↔ 视频/评论监控模块（在 Video/Comment 相关页面读取 `KeywordMonitor`）
  2. 接入真实指数 API（百度指数/抖音热点宝等）为热词评分提供数据支撑
