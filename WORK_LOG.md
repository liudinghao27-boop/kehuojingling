# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-15

## 本次完成

### Phase 3：接入真实指数 API 为热词评分提供数据支撑

- Schema 变更（`prisma/schema.prisma`）
  - `AiResearchHistory` 新增 `indexData Json?` 字段，用于保存原始指数 API 响应。
  - `AiResearchHistory` 新增 `usedRealIndexData Boolean @default(false)` 字段，标记是否使用了真实指数数据。
  - 生成并应用迁移 `20260715091710_add_index_data_to_research_history`，已同步至 `kehuojingling_test` 测试库。

- 新增指数 API 模块（`src/lib/ai/index-api.ts`）
  - 定义 `IndexDataPoint` 与 `IndexProvider` 接口。
  - 实现 `mockIndexProvider`：确定性 mock，按关键词长度生成搜索量/竞争度，confidence=0.5。
  - 实现 `baiduIndexProvider` / `douyinHotProvider` 占位：未配置 Key 时返回空数组并警告；配置后调用占位端点，失败不阻塞。
  - 实现 `createCompositeIndexProvider`：并行调用多个提供者，按 keyword 合并，真实来源优先，多真实结果按 confidence 加权平均。
  - 实现 `createDefaultIndexProvider`：根据 `ENABLE_REAL_INDEX_API` 自动组合 mock + 真实提供者。

- 更新关键词评分逻辑（`src/lib/ai/keywords.ts`）
  - `ScoredKeyword` 扩展 `source` 与 `confidence` 字段。
  - `KeywordResearchResult` 扩展可选 `indexData`。
  - `extractKeywordsWithAI` 新增 `indexProvider` 参数，默认调用 `createDefaultIndexProvider()`。
  - LLM 返回后，若存在指数数据则与 LLM 估算合并：真实搜索量/竞争度优先，商业意向保留 LLM 值，按原公式重新计算 score，并标记 source/confidence。

- 更新 API 路由（`src/app/api/ai/keywords/route.ts`）
  - 调用 `createDefaultIndexProvider()` 并传入 `extractKeywordsWithAI`。
  - 提取成功后自动保存 `AiResearchHistory`，包含完整 `KeywordResearchResult`、`indexData` 与 `usedRealIndexData`。

- 前端更新
  - `KeywordScoreChart` 接受 `source` 并在图表上方显示数据来源（AI 估算 / 混合数据等）。
  - `dashboard/ai-assistant/page.tsx` 向图表传递 source，使用真实指数数据时显示绿色提示文字。

- 配置文档
  - `.env.example` 新增 `ENABLE_REAL_INDEX_API`、`BAIDU_INDEX_API_KEY`、`DOUYIN_HOT_API_KEY`。
  - `ENV_CONFIG.md` 补充真实指数 API 说明。

- 测试
  - 新增 `src/lib/ai/index-api.test.ts`：7 个用例，覆盖 mock 确定性、组合合并、真实来源优先、Key 缺失回退。
  - 更新 `src/lib/ai/keywords.test.ts`：新增 3 个用例，覆盖 mock 数据合并、source/confidence、真实数据覆盖 LLM 估算。
  - 更新 `src/app/api/ai/keywords/route.test.ts`：新增 1 个用例，验证历史记录保存与 `usedRealIndexData`/`indexData`。

### 验证
- `npm test`：97 个用例全部通过（原有 86 个 + 新增 11 个）
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
- 百度指数/抖音热点宝当前为占位实现，真实 endpoint 与鉴权方式确认后替换 `callIndexApi` 中的 URL 与响应解析
- 抖音自动回复/私信依赖真实 Cookie 和 Playwright，生产需单独维护
- 抓取服务需独立部署，生产可修改 `SCRAPER_API_URL` 为公网地址，或配合反向代理保持 `/api/scraper`
- **下一阶段重点**：生产部署、移动端 UI 优化、完善真实指数 API 端点

## 下次继续记录
- **当前分支**：`main`
- **最近两次提交**：
  1. `c004c57 docs: add checkpoint for next session`
  2. `535726d feat: AI 获客助手热词评分与监控桥接`
- **已启用测试框架**：Vitest + `kehuojingling_test` 测试库
- **推荐继续方向**：
  1. 确认百度指数/抖音热点宝真实 API 并替换占位端点
  2. 生产环境部署与监控
