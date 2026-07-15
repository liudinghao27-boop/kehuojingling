# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-15

## 本次完成

### Phase 1：抖音真实发送 Provider 稳定化

- 重构 `src/lib/sender/providers/douyin.ts`
  - 抽离 `parseCookies`、`getCookies` 为可测试纯函数。
  - 抽离浏览器生命周期管理（`launchContext`、`getSharedContext`、`withBrowser`）。
  - Debug 截图改为 `SENDER_DEBUG=1` 显式开启；可见浏览器由 `SENDER_HEADLESS=false` 控制。
  - 注册 `SIGINT`/`SIGTERM`/`exit` 清理逻辑，防止 dev 环境残留 Chrome 进程。
  - 新增 `normalizeSendError`，对缺少 Cookie、登录过期、元素未找到、风控验证等场景给出明确错误信息。
- 新增 `src/lib/sender/providers/douyin.test.ts`：16 个用例，覆盖 Cookie 解析、`validateCredentials`、`sendReply`、`sendDm` 正常/失败路径。
- 整理调试脚本：将 `scripts/test-douyin-*.ts` 与 `scripts/update-douyin-cookies*.ts` 移入 `scripts/debug/`，并新增 `README.md`。
- `.gitignore` 增加 `logs/`，避免提交浏览器资料与调试截图。
- 新增计划文档 `docs/plans/2026-07-15-douyin-sender-phase1.md`。

### Phase 2：打通监控词库 ↔ 视频/评论监控模块

- Schema 变更（`prisma/schema.prisma`）
  - `Video` 新增可选 `keywordMonitorId` / `keywordMonitor` 关联。
  - `KeywordMonitor` 新增反向 `videos` 关联。
  - `Comment` 新增 `matchedKeywords String[]`。
  - 生成并应用迁移 `20260715091202_add_keyword_monitor_to_video`，已同步至 `kehuojingling_test` 测试库。
- 新增 `POST /api/videos/from-keyword`
  - 支持从监控词库创建视频监控，自动校验关键词归属、套餐额度、链接格式。
- 更新 `GET /api/videos`
  - 返回 `keywordMonitor` 信息，前端视频卡片展示关键词徽章。
- 更新 `src/lib/scraper/index.ts`
  - 新增 `extractMatchedKeywords`，保存评论时自动计算命中当前用户监控词库的关键词。
- 更新 `GET /api/comments`
  - 响应携带 `matchedKeywords`；新增 `keyword` 查询参数按命中关键词过滤。
- 前端更新
  - `/dashboard/videos`：添加监控词下拉框，选中时调用 `/api/videos/from-keyword`。
  - `/dashboard/comments`：展示命中监控词徽章，新增关键词过滤器。
- 测试
  - 新增 `src/app/api/videos/from-keyword/route.test.ts`。
  - 新增 `src/lib/scraper/index.test.ts`。
  - 更新 `src/app/api/comments/route.test.ts`。

### Phase 3：接入真实指数 API 为热词评分提供数据支撑

- Schema 变更（`prisma/schema.prisma`）
  - `AiResearchHistory` 新增 `indexData Json?` 与 `usedRealIndexData Boolean @default(false)`。
  - 生成并应用迁移 `20260715091710_add_index_data_to_research_history`，已同步至 `kehuojingling_test` 测试库。
- 新增指数 API 模块（`src/lib/ai/index-api.ts`）
  - 定义 `IndexDataPoint` / `IndexProvider` 接口。
  - 实现 `mockIndexProvider`、`baiduIndexProvider`、`douyinHotProvider`、`createCompositeIndexProvider`、`createDefaultIndexProvider`。
- 更新关键词评分逻辑（`src/lib/ai/keywords.ts`）
  - `ScoredKeyword` 扩展 `source` / `confidence`。
  - `extractKeywordsWithAI` 合并真实指数数据与 LLM 估算，重新计算 score。
- 更新 `POST /api/ai/keywords`
  - 成功后自动保存 `AiResearchHistory`，包含 `indexData` 与 `usedRealIndexData`。
- 前端更新
  - `KeywordScoreChart` 显示数据来源（AI 估算 / 混合数据等）。
  - `/dashboard/ai-assistant` 使用真实指数数据时显示提示。
- 配置文档
  - `.env.example` / `ENV_CONFIG.md` 新增 `ENABLE_REAL_INDEX_API`、`BAIDU_INDEX_API_KEY`、`DOUYIN_HOT_API_KEY` 说明。
- 测试
  - 新增 `src/lib/ai/index-api.test.ts`。
  - 更新 `src/lib/ai/keywords.test.ts`。
  - 更新 `src/app/api/ai/keywords/route.test.ts`。

### 提交记录

已按 Phase 1 → Phase 2 → Phase 3 分三次提交：

```
6f2792c feat: integrate real index API for keyword scoring (Phase 3)
43d80dc feat: bridge KeywordMonitor with video/comment monitoring (Phase 2)
4bd93e0 refactor(sender): stabilize Douyin real-sender provider, add tests, organize debug scripts
```

### 验证

- `npm test`：**97 个用例全部通过**
- `npm run lint`：通过
- `npx tsc --noEmit`：通过
- `npm run build`：通过
- `git status`：工作区干净

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

- 百度指数 / 抖音热点宝当前为占位实现，真实 endpoint 与鉴权方式确认后替换 `src/lib/ai/index-api.ts` 中的 `callIndexApi` URL 与响应解析。
- 抖音自动回复 / 私信依赖真实 Cookie 和 Playwright，生产需单独维护。
- 抓取服务需独立部署，生产可修改 `SCRAPER_API_URL` 为公网地址，或配合反向代理保持 `/api/scraper`。
- **下一阶段重点**：生产部署、移动端 UI 优化、完善真实指数 API 端点。

## 下次继续记录

- **当前分支**：`main`
- **最近三次提交**：
  1. `6f2792c feat: integrate real index API for keyword scoring (Phase 3)`
  2. `43d80dc feat: bridge KeywordMonitor with video/comment monitoring (Phase 2)`
  3. `4bd93e0 refactor(sender): stabilize Douyin real-sender provider, add tests, organize debug scripts`
- **已启用测试框架**：Vitest + `kehuojingling_test` 测试库
- **推荐继续方向**：
  1. 确认百度指数 / 抖音热点宝真实 API 并替换占位端点。
  2. 生产环境部署与监控。
  3. 数据报表页图表与移动端适配。
