# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-14

## 本次完成

### 1. 代码质量修复
- 修复全部 82 个 ESLint 问题（54 errors, 28 warnings）
- 统一 `unknown` 错误处理：新增 `src/lib/errors.ts`
- 替换所有 `catch (error: any)`，消除显式 `any`
- 修复 React Hooks 问题：effect 内 setState、函数声明顺序、依赖项缺失
- `npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过

### 2. UI 展示噪音类型
- 数据库 `Comment` 模型新增 `isNoise`、`noiseType`、`noiseReason` 字段
- 抓取逻辑改为保存所有评论（含噪音），不再直接丢弃
- 评论列表 API 新增 `noise` 参数：`false`（默认隐藏噪音）/`true`（仅噪音）/`all`（全部）
- 评论列表 UI 增加噪音过滤按钮：隐藏噪音 / 仅噪音 / 含噪音
- 评论卡片显示噪音类型标签（同行 / 广告 / 诈骗 / 无关 / 纯情绪）和过滤原因
- 噪音评论禁用回复/私信/批量选择，视觉上以灰色+删除线区分
- 导出 CSV 增加「噪音类型」和「噪音原因」两列

## 当前运行状态
- 获客精灵：`http://localhost:3000` ✅
- 抓取服务：`http://localhost:8000` ✅
- 数据库：Render PostgreSQL 正常 ✅
- DeepSeek Key：已加密存储 ✅

## 开发命令

```bash
# 终端 1：启动抓取服务
cd /e/ai/Douyin_TikTok_Download_API && .venv/Scripts/python start.py

# 终端 2：启动 Next.js
cd /e/ai/YJ-HUOKE && npm run dev:clean
```

## 已知问题 / 后续
- 抖音自动回复/私信依赖真实 Cookie 和 Playwright，生产需单独维护
- 抓取服务需独立部署，生产修改 `SCRAPER_API_URL`
- 建议后续：阈值可配置（用户自行调整最低意向分）、两端口整合、本地噪音规则可配置
