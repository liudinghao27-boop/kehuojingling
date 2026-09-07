# 获客精灵 - Sealos 部署指南（唯一部署路径）

> 2026-08-23 起 Render 方案废弃（`render.yaml` 已删除），生产环境迁移至 Sealos 杭州区。
> 密码、密钥等敏感值全部保存在本地 `deploy-secrets.local.md`（已 gitignore，不进仓库）。

## 一、当前生产环境（已上线）

- **公网地址**：https://ejahosctpwsb.sealoshzh.site
- **平台**：Sealos 杭州区 https://hzh.sealos.run ，账号命名空间 `ns-qx3gkyoi`（GitHub 账号 liudinghao27-boop 登录；8 月 13 日的旧账号 ns-23ctphuq 已弃用）
- **应用**：应用管理（App Launchpad）→ `kehuojingling`，0.2C / 512M / 固定 1 实例，端口 3000，公网已开
- **镜像**：`ghcr.io/liudinghao27-boop/kehuojingling:latest`（GHCR 公开包，push 到 main 后 GitHub Actions 自动构建）
- **数据库**：数据库应用 → `kehuojingling`（PostgreSQL 16，0.5C/512Mi/3Gi）
- **队列**：数据库应用 → `kehuojingling-redis`（Redis 7）
- **爬虫**：应用管理 → `kehuojingling-scraper`（云端常驻，**仅内网**不开公网；镜像 `ghcr.io/liudinghao27-boop/kehuojingling-scraper:latest`，源码在公开仓库 `liudinghao27-boop/kehuojingling-scraper`，push main 自动构建）
- 连接串与密钥：见 `deploy-secrets.local.md`

> 经验：Sealos 的 kubeconfig 会过期。API 报 `NOT_FOUND` / `unable to verify the first certificate` / 列表为空时，先在浏览器打开 Sealos 桌面，从 `localStorage.session` 取新 kubeconfig 再下结论。

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

## 四、抓取服务与发送器

- **抓取服务**：已云端化（`kehuojingling-scraper` 应用，内网直连主应用，无需隧道、无需本机窗口）。更新爬虫代码：push 到 `kehuojingling-scraper` 仓库 main → 等镜像构建 → Sealos 重启该应用。
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
| 爬虫 0.5C/1G | ≈ ¥0.90/天 |
| PG 0.5C/512Mi/3Gi | ≈ ¥0.56/天 |
| Redis | ≈ ¥0.66/天 |
| PG 外网访问 | ≈ ¥0.34/天（可关） |
| **合计** | **≈ ¥2.8/天** |

## 七、本地开发

```bash
npm run dev:all    # Next.js + 抓取服务（本机内存小，不要启 Docker Desktop）
# 测试用云端 Neon 测试库（vitest 不会自动加载 .env.test，必须先 export）：
export TEST_DATABASE_URL=$(grep '^TEST_DATABASE_URL=' .env.test | cut -d= -f2- | tr -d "\"'")
npm test
```

> ⚠️ 本机启 Docker Desktop 会导致系统卡死重启，本地开发数据库请用 `TEST_DATABASE_URL` 指向云端测试库。

## 八、VPN 边界（商业部署要求：运行时必须全程无 VPN）

**运行时链路全部境内直连，2026-09-07 从 Sealos pod 实测**：

| 链路 | 结果 | 说明 |
|------|------|------|
| pod → ghcr.io | ✅ 401（registry 正常，401 是未带 token 的标准响应） | 镜像拉取无代理依赖 |
| pod → api.tikhub.io | ✅ 200（~1-2s） | TikHub 对境内直连友好，无需代理 |
| pod → www.douyin.com | ✅ 200（0.16s） | 境内 |
| pod → PG/Redis | ✅ 内网 | — |

**仅开发侧 GitHub（push / Actions / 网页）受墙影响**，本机三条通道按序使用：

1. `git push` 直连（波动，时通时断；注意本机需 `git -c http.sslBackend=openssl push`）
2. 直连被墙时：`node scripts/debug/api_push.mjs`（走 api.github.com Git Data API，历史上直连可用）
3. 开 VPN 时：仓库已配 `http.https://github.com.proxy=http://127.0.0.1:10808`（仅 github.com 走代理，不影响其他域名）

**⚠️ VPN 全局/系统代理开启时，Sealos（hzh.sealos.run、*.sealoshzh.site）及国内站反而不可达**——kubectl/curl 不走系统代理但 TUN 模式会劫持；操作 Sealos 前先关 VPN 或确认 sealos 域名走直连规则。

## 九、安全提醒

- 仓库当前为 **public**，早期 DEPLOY.md 中的密钥已进入 git 历史，建议尽快把仓库设为 private，并在方便时轮换 `NEXTAUTH_SECRET` 与两个加密 key（轮换加密 key 前需先清空已加密的账号 Cookie 数据）。
