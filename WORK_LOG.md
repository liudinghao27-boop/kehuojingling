# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-15

## 本次完成

### 1. 本地噪音规则可配置
- `User` 表新增 `noiseRules` JSON 字段
- 生成 migration：`20260714182248_add_noise_rules`
- `src/lib/ai/noise.ts`：
  - 新增 `NoiseRules` 类型与 `DEFAULT_NOISE_RULES`
  - `classifyNoiseLocal` 支持读取用户自定义规则
  - `NOISE_SYSTEM_PROMPT` 改为 `buildNoiseSystemPrompt`，注入用户规则和行业场景
  - `analyzeComments` 签名扩展 `noiseRules` 参数
- 扩展 NextAuth session/jwt，设置页可直接读取当前规则
- 扩展 `/api/user/profile` API，支持保存噪音规则（每类最多 50 个，每个最长 20 字符）
- 设置页「AI 模型配置」新增噪音规则编辑器：
  - 5 个 textarea 分别编辑：同行/广告/诈骗/纯情绪/无关
  - 支持换行或逗号分隔关键词
  - 提供「恢复默认规则」按钮
  - 保存按钮即时生效
- 后端调用点传递规则：
  - `src/app/api/scrape/comments/route.ts`
  - `src/app/api/ai/analyze/route.ts`（GET 批量分析）

### 2. 验证
- `npx prisma generate` 成功
- `npm run lint` 通过
- `npx tsc --noEmit` 通过
- `npm run build` 通过

## 当前运行状态
- 获客精灵：`http://localhost:3000` ✅
- 抓取服务：`http://localhost:8000` ✅
- 本地数据库：`localhost:5432` ✅
- 本地 Redis：`localhost:6379` ✅
- DeepSeek Key：已加密存储 ✅

## 开发命令

```bash
# 启动本地数据库和 Redis
cd /e/ai/YJ-HUOKE && docker compose up -d

# 一键启动 Next.js + 抓取服务
cd /e/ai/YJ-HUOKE && npm run dev:all

# 如需单独启动
cd /e/ai/YJ-HUOKE && npm run dev:clean       # 仅 Next.js
cd /e/ai/YJ-HUOKE && npm run dev:scraper     # 仅抓取服务
```

## 已知问题 / 后续
- 抖音自动回复/私信依赖真实 Cookie 和 Playwright，生产需单独维护
- 抓取服务需独立部署，生产修改 `SCRAPER_API_URL`
- 建议后续：两端口整合、核心 API 测试覆盖、AI 获客助手热词研究功能增强
