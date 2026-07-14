# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-14

## 本次完成

### 1. 数据迁移到本地
- 修复 Docker Desktop 镜像拉取失败：配置 DaoCloud 镜像源 `docker.m.daocloud.io`
- 启动本地 PostgreSQL + Redis：`docker compose up -d`
- 从 Render PostgreSQL 导出完整数据：`pg_dump`（数据库大小约 8.6 MB）
- 导入到本地 `kehuojingling` 数据库：用户、视频、评论、回复、私信、模板、活动全部保留
- 更新 `.env`：
  - `DATABASE_URL` 指向本地 `localhost:5432`
  - 新增 `REDIS_URL=redis://localhost:6379`
  - 新增 `SCRAPER_API_URL=http://localhost:8000`
  - `NEXTAUTH_URL` 统一为 `http://localhost:3000`
- 数据库备份保存到 `backups/render_dump.sql`（已加入 `.gitignore`）

### 2. 验证
- `npx prisma generate` 成功
- `npm run lint` 通过
- `npx tsc --noEmit` 通过
- `npm run build` 通过
- 本地数据库查询验证：用户/视频/评论数据与 Render 一致

## 当前运行状态
- 获客精灵：`http://localhost:3000` ✅
- 抓取服务：`http://localhost:8000` ✅
- 本地数据库：`localhost:5432` ✅
- 本地 Redis：`localhost:6379` ✅
- DeepSeek Key：已加密存储 ✅

## 开发命令

```bash
# 启动本地数据库和 Redis（已启动）
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
