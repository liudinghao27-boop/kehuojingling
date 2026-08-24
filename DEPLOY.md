# 获客精灵 - Sealos 部署指南（唯一部署路径）

> 2026-08-23 起 Render 方案废弃（`render.yaml` 已删除），生产环境迁移至 Sealos 杭州区。
> 密码、密钥等敏感值全部保存在本地 `deploy-secrets.local.md`（已 gitignore，不进仓库）。

## 一、当前生产环境（已上线）

- **公网地址**：https://ejahosctpwsb.sealoshzh.site
- **平台**：Sealos 杭州区 https://hzh.sealos.run ，账号命名空间 `ns-qx3gkyoi`（GitHub 账号 liudinghao27-boop 登录；8 月 13 日的旧账号 ns-23ctphuq 已弃用）
- **应用**：应用管理（App Launchpad）→ `kehuojingling`，0.2C / 512M / 固定 1 实例，端口 3000，公网已开
- **镜像**：`ghcr.io/liudinghao27-boop/kehuojingling:latest`（GHCR 公开包，push 到 main 后 GitHub Actions 自动构建）
- **数据库**：数据库应用 → `kehuojingling`（PostgreSQL 16，0.5C/512Mi/3Gi）
- **队列**：数据库应用 → `kehuojingling-redis`（Redis 7，0.6C/612Mi/4Gi）
- 连接串与密钥：见 `deploy-secrets.local.md`

## 二、日常更新流程（改代码后上线）

1. `git push` 到 main（本机推送需 `git -c http.sslBackend=openssl push`）
2. 等 GitHub Actions 构建镜像成功（约 5 分钟）
3. Sealos → 应用管理 → `kehuojingling` → **重启**（latest 标签需重启才会拉新镜像）

## 三、环境变量（应用管理 → kehuojingling → 编辑）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PG **内网**连接串（见 secrets 文件） |
| `REDIS_URL` | Redis **内网**连接串（见 secrets 文件） |
| `NEXTAUTH_SECRET` | 见 secrets 文件 |
| `NEXTAUTH_URL` | `https://ejahosctpwsb.sealoshzh.site` |
| `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` | 见 secrets 文件（更换后已加密数据无法解密，勿轮换） |
| `AI_API_KEY_ENCRYPTION_KEY` | 见 secrets 文件 |
| `SENDER_PROVIDER` | 试用初期 `mock`（只记录不真发）；真实发送改 `real` |
| `SCRAPER_API_URL` | 抓取服务隧道域名（见「四」，隧道重启后需更新并重启应用） |

改环境变量保存后应用会自动重建部署。

## 四、抓取服务与发送器（混合模式）

Playwright 发送器和 Python 爬虫留在本机，云端通过内网穿透调用爬虫：

- **启动爬虫**（本机窗口 1，保持开着）：
  ```
  cd E:\ai\YJ-HUOKE
  node scripts/start-scraper.js
  ```
  （爬虫本体在 `E:/ai/Douyin_TikTok_Download_API`，用其 `.venv` 里的 Python，监听 8000 端口）
- **启动隧道**（本机窗口 2，保持开着）：
  ```
  ssh -R 80:localhost:8000 nokey@localhost.run
  ```
  首次连接输入 `yes`。启动后屏幕会显示 `https://xxxxxxxx.lhr.life` 域名。
- **每次隧道重启域名都会变**：拿到新域名后更新应用的 `SCRAPER_API_URL` 环境变量并重启应用。
- **发送器**：试用初期 `SENDER_PROVIDER=mock`；真实发送时在有浏览器的机器上运行 Playwright，Cookie 通过 Dashboard → 账号管理录入。

## 五、数据库维护（本机执行）

- PG 已开外网访问（¥0.014/小时），外网连接串见 secrets 文件
- 跑迁移：`DATABASE_URL="<PG外网连接串>" npx prisma migrate deploy`
- 已知坑：kubeblocks 自带 cron 等表会导致 `P3005`，需先手工建空的 `_prisma_migrations` 表（标准 8 列）再 `migrate deploy`
- 不用时可关闭 PG 外网访问省钱（应用走内网不受影响）

## 六、费用估算（余额敏感）

| 项目 | 费用 |
|------|------|
| 应用 0.2C/512M | ≈ ¥0.30/天 |
| PG 0.5C/512Mi/3Gi | ≈ ¥0.56/天 |
| Redis 0.6C/612Mi/4Gi | ≈ ¥0.66/天 |
| PG 外网访问 | ≈ ¥0.34/天（可关） |
| **合计** | **≈ ¥1.9/天** |

## 七、本地开发

```bash
npm run dev:all    # Next.js + 抓取服务（本机内存小，不要启 Docker Desktop）
npm test           # 测试；TEST_DATABASE_URL 可指向云端测试库
```

> ⚠️ 本机启 Docker Desktop 会导致系统卡死重启，本地开发数据库请用 `TEST_DATABASE_URL` 指向云端测试库。

## 八、安全提醒

- 仓库当前为 **public**，早期 DEPLOY.md 中的密钥已进入 git 历史，建议尽快把仓库设为 private，并在方便时轮换 `NEXTAUTH_SECRET` 与两个加密 key（轮换加密 key 前需先清空已加密的账号 Cookie 数据）。
