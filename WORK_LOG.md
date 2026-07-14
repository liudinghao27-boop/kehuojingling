# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-15

## 本次完成

### AI 获客助手热词研究功能增强
- 数据层：
  - `prisma/schema.prisma`：
    - `AiResearchHistory` 新增 `scoredKeywords Json?`、`tags String[]`、`isFavorite Boolean`、`updatedAt DateTime`
    - 新增 `KeywordMonitor` 模型与 `User` 关联，用于「我的监控词库」
  - 生成并应用 migration：`20260714184102_add_keyword_scoring_and_monitoring`
- AI 层：
  - `src/lib/ai/keywords.ts`：
    - 新增 `ScoredKeyword` 类型与 `scoredKeywords` 字段
    - Prompt 要求 LLM 为每个关键词输出搜索量、竞争度、商业意向、综合热度评分（1-5）
    - `normalizeResult` 对评分做归一化、缺省兜底、空关键词过滤
    - 导出 `normalizeResult` 便于单元测试
- API 层：
  - `src/app/api/ai/keywords/route.ts`：返回含 `scoredKeywords` 的研究结果
  - `src/app/api/ai/history/route.ts`：保存/返回 `scoredKeywords`、`tags`、`isFavorite`
  - `src/app/api/ai/history/[id]/route.ts`：新增 `PATCH` 支持修改标题、标签、收藏状态
  - `src/app/api/keywords/monitor/route.ts`（新建）：监控词库的 GET/POST/DELETE
- 前端层：
  - `src/app/dashboard/ai-assistant/page.tsx`：
    - 新增「热词评分」表格，支持按综合热度/搜索量/竞争度/商业意向排序
    - 新增关键词复选框，可一键保存到「监控词库」
    - 历史记录支持收藏、标题编辑、标签增删
  - `src/components/ai-assistant/KeywordScoreChart.tsx`（新建）：recharts 柱状图展示 Top 10 热词
- 测试层：
  - `src/lib/ai/keywords.test.ts`：评分归一化测试
  - `src/app/api/ai/keywords/route.test.ts`：关键词提取与额度限制测试
  - `src/app/api/keywords/monitor/route.test.ts`：监控词库 CRUD 与用户隔离测试
  - `src/app/api/ai/history/[id]/route.test.ts`：PATCH 更新与用户隔离测试

### 验证
- `npm test`：45 个用例全部通过
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
- 监控词库当前仅保存，尚未与视频/评论监控模块打通，可作为下一阶段桥接点

## 下次继续记录
- **当前分支**：`main`
- **最近两次提交**：
  1. `535726d feat: AI 获客助手热词评分与监控桥接`
  2. `95e7c50 test: add core API test coverage`
- **已启用测试框架**：Vitest + `kehuojingling_test` 测试库
- **推荐继续方向**：
  1. 打通监控词库 ↔ 视频/评论监控模块（在 Video/Comment 相关页面读取 `KeywordMonitor`）
  2. 两端口整合（Next.js 与抓取服务合并或统一启动脚本）
  3. 接入真实指数 API（百度指数/抖音热点宝等）为热词评分提供数据支撑
