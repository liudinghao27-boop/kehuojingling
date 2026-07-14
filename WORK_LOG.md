# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-15

## 本次完成

### 1. 设置页「平台账号配置」改造收尾
- 修复书签小工具 CORS：支持抖音、快手、视频号三个域名
  - `src/app/api/user/platform-credentials/[platform]/bookmarklet/route.ts`
  - 非白名单域名的请求返回 403
- 清理 QR 扫码登录死代码：
  - 删除 `src/lib/qr-login/` 整个目录
  - 删除 `src/app/api/user/platform-credentials/[platform]/qr-login/route.ts`

### 2. Prisma 迁移规范化
- 生成 baseline migration：`prisma/migrations/0_init/migration.sql`
- 创建 `prisma/migrations/migration_lock.toml`
- 当前数据库已标记为已应用 baseline，不影响现有数据
- 后续数据库变更可安全使用 `prisma migrate dev` / `prisma migrate deploy`

### 3. 验证
- `npm run lint` 通过
- `npx tsc --noEmit` 通过（清理 `.next` 缓存后）
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
- 建议后续：阈值可配置（用户自行调整最低意向分）、两端口整合、本地噪音规则可配置
