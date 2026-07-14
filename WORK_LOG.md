# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-15

## 本次完成

### 1. 意向分阈值可配置
- `User` 表新增 `intentScoreThreshold` 字段（默认 4，范围 1-5）
- 生成 migration：`20260714181728_add_intent_score_threshold`
- 扩展 NextAuth session/jwt，设置页可直接读取当前阈值
- 扩展 `/api/user/profile` API，支持单独更新阈值
- 设置页「AI 模型配置」新增 1-5 分段阈值选择器，点击即保存
- 后端逻辑全面使用用户阈值替代硬编码 4：
  - 单条/批量意向分析：`score >= threshold ? 'ANALYZED' : 'NEW'`
  - 抓取评论过滤：丢弃 `score < threshold` 的评论
  - 评论列表「高意向」筛选：`intentScore >= threshold`
  - 视频高意向统计按阈值计算

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

# 终端 1：启动抓取服务
cd /e/ai/Douyin_TikTok_Download_API && .venv/Scripts/python start.py

# 终端 2：启动 Next.js
cd /e/ai/YJ-HUOKE && npm run dev:clean
```

## 已知问题 / 后续
- 抖音自动回复/私信依赖真实 Cookie 和 Playwright，生产需单独维护
- 抓取服务需独立部署，生产修改 `SCRAPER_API_URL`
- 建议后续：本地噪音规则可配置、两端口整合、核心 API 测试覆盖
