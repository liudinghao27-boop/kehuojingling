# 获客精灵 - Render 部署指南（唯一部署路径）

> 2026-08-12 起 Vercel 方案已废弃（`vercel.json` 已删除）。原因：Bull 队列、Playwright 发送器、定时维护任务均为长驻有状态负载，serverless 模型不适用。

## 一、一键部署（Blueprint）

1. 打开 https://dashboard.render.com → **New** → **Blueprint**
2. 选择仓库 `liudinghao27-boop/kehuojingling`
3. Render 读取根目录 `render.yaml`，自动创建：
   - Web Service（Next.js，启动时自动执行 `prisma migrate deploy`）
   - Redis（Bull 队列，`noeviction`）
   - PostgreSQL（free 1GB）
4. 应用 Blueprint 时 / 之后，在 Web Service 的 Environment 中填入以下 `sync: false` 变量：

| 变量 | 值 |
|------|-----|
| `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` | 见下方「生产密钥」（32 字节 base64，Cookie/凭证加密，**不填生产环境会启动报错**） |
| `AI_API_KEY_ENCRYPTION_KEY` | 见下方「生产密钥」 |
| `NEXTAUTH_SECRET` | Blueprint 自动生成，也可换成下方值 |
| `OPENAI_API_KEY` | DeepSeek key（不填则 AI 分析回退本地规则） |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1` |
| `OPENAI_MODEL` | `deepseek-v4-flash` |
| `SCRAPER_API_URL` | 抓取服务公网地址（见「三」） |
| `SENDER_PROVIDER` | 试用初期建议 `mock`（只记录不真发）；真实发送用 `real` 或留空 |

### 生产密钥（2026-08-12 生成，仅此处与 Render Dashboard 保存）

```
NEXTAUTH_SECRET=/4NCds1KqPnPTectufFqliUgCpAUt9Hxkdpe2rN2JFE=
PLATFORM_CREDENTIALS_ENCRYPTION_KEY=jPm8bxnKfhGEIygdfnvEAhLUpweS069ya0Tya4y0WU0=
AI_API_KEY_ENCRYPTION_KEY=14sC6TU8v1KCZ34wJP9WhP5VsDWn0wvbWXkbiH2ttLo=
```

> 重新生成命令：`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`。
> 注意：更换 `*_ENCRYPTION_KEY` 会导致已加密数据无法解密，请勿在已有数据后轮换。

## 二、验证部署

- 访问 `https://kehuojingling.onrender.com/login`，注册账号并登录
- Dashboard 各页面可打开；设置页可保存 AI key
- 免费限制：15 分钟无访问休眠（首访约 30 秒唤醒）；免费 PG 90 天闲置删除

## 三、抓取服务与发送器（混合模式）

以下两个组件不适合放在 Render，试用期间采用「云端 Web + 本地工作机」混合模式：

- **抓取服务**（Python，Evil0ctal/Douyin_TikTok_Download_API）：在本机运行 `npm run dev:scraper`，用内网穿透暴露后，将公网地址填入 Render 的 `SCRAPER_API_URL`（填裸域名即可，代理自动拼接路径）。
  - 2026-08-12 当前隧道（localhost.run，SSH 方式，绕开 VPN 对 cloudflared 的 TLS 拦截）：
    `https://02b72ec76c55cb.lhr.life`
  - 重启隧道命令（机器重启后需重跑，域名会变化，需同步更新 Render 变量）：
    `ssh -R 80:localhost:8000 nokey@localhost.run`
- **发送器**（Playwright 有头浏览器，需人工完成抖音登录/短信验证）：在有浏览器的机器上运行，Cookie 通过 Dashboard → 账号管理录入，云端队列消费时下发。

## 四、本地开发

```bash
docker compose up -d      # PG + Redis
npm run dev:all           # Next.js + 抓取服务
npm test                  # 196 个用例；无 Docker 时 TEST_DATABASE_URL 可指向云端测试库
```
