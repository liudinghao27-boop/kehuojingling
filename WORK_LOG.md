# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-08-12

## 本次完成

### 方案 A Phase 1：账号池 + 基础熔断（✅ 已完成并验证）

依据 `docs/plans/2026-07-24-plan-a-playwright-risk-control.md`：

- **Schema**：`prisma/schema.prisma` 新增 `SenderAccount` 模型 + `AccountStatus` 枚举；迁移 `prisma/migrations/20260724182534_add_sender_accounts` **已应用**（主库 + 测试库）。
- **账号池** `src/lib/sender/account-pool.ts`
  - `pickAccount`（健康度 > 剩余额度 > 最久未用）、`isAccountAvailable`
  - `handleSendFailure`（风控 -20 / 普通 -5，连续 3 次或健康度 <30 触发 2 小时冷却）、`handleSendSuccess`（回血 +2）
  - `recoverAccount` / `recoverCoolingAccounts` / `resetDailySentCounts`
  - 账号 CRUD + `checkContentCompliance`
- **合规模块** `src/lib/safety/compliance.ts` 重写：敏感词库分层（联系方式/诱导词/违规词）、风险等级、`generateCompliantVariant` 自动改写、安全发送时间窗口。
- **队列改造** `src/lib/queue/index.ts`：抽出 `processSendJob` 统一处理回复/私信，接入账号选择、发送前合规拦截与自动改写、失败熔断；新增 `maintenance` 队列（每日 0 点重置额度、每小时恢复冷却账号）；回复/私信队列加 Bull limiter。
- **API**：`GET/POST /api/user/sender-accounts`、`GET/PATCH/DELETE /api/user/sender-accounts/[id]`（含归属校验、冷却恢复逻辑）。
- **账号管理 UI**：`src/app/dashboard/accounts/page.tsx` —— 账号列表（平台/状态/健康度 badge、今日已发、最近成功时间、Skeleton 加载态）、平台筛选、新增/编辑 Dialog（编辑时 Cookies 留空不改、代理清空提交 null）、删除确认、状态操作（冷却恢复 / 禁用 / 启用）；`Navbar.tsx` 导航新增"账号管理"。
- **测试**：新增 `src/lib/sender/account-pool.test.ts`（20+ 用例）、`src/app/api/user/sender-accounts/route.test.ts`、`[id]/route.test.ts`；测试基建新增 `createSenderAccount` 工厂，`clearDatabase` 增加 `sender_accounts` 表。
- 修复 lint 未使用导入告警；`account-pool` 不再重复实现 `generateCompliantVariant`，改为从 `compliance` re-export。

### 验证

### 方案 A Phase 2：行为拟人化 + 代理（✅ 已完成并验证）

- **拟人化** `src/lib/sender/humanize.ts`：`humanType`（逐字 pressSequentially，50-200ms/字符，5% 停顿）、`simulateHumanBrowsing`（随机滚动 2-5 次 + 鼠标移动 2-4 次）；douyin provider 打开页面后、找评论前调用，4 处 `fill` 全部替换。
- **代理** `src/lib/sender/proxy.ts`：`parseProxyUrl`（http/socks5，认证 URL 解码）；三条启动路径（headless/persistent/fallback）均注入 proxy；共享 context 缓存 key 改为 cookies+proxy 双哈希（顺带修复了原代码复用时不校验 key 的串号隐患）。
- **UA/指纹** `src/lib/sender/ua-pool.ts`：10 个 Chrome/Edge UA 池、随机 viewport（1200-1440×720-900）、locale zh-CN + timezone Asia/Shanghai、`applyStealthScripts`（隐藏 webdriver、补 window.chrome、languages、权限伪装）。
- **队列** `src/lib/queue/index.ts`：`credentials.proxyUrl` 下传（有才加键）；安全窗口真正生效——`isSafeSendTime()` 为 false 时 `job.moveToDelayed(getNextSafeSendTime())` 推迟并 return，moveToDelayed 不可用/失败降级为立即发送（发送链路不崩）。窗口内 5-30 分钟抖动由入队 delay + Bull limiter 覆盖，不二次延迟。
- **测试**：新增 `humanize.test.ts`/`proxy.test.ts`/`ua-pool.test.ts`（21 用例）、`src/lib/queue/process-send-job.test.ts`（6 用例，真实 DB + mock provider/compliance）；douyin.test.ts 新增 6 用例（proxy 注入、指纹选项、共享 context key），fake locator/page 补 pressSequentially/mouse/addInitScript，17 个既存用例零改动。

### 方案 A Phase 3：监控告警 + 运营工具（✅ 已完成并验证）

- **告警模块** `src/lib/monitor/alert.ts`：钉钉/企业微信 markdown webhook（10s 超时，失败只 warn 不抛错）；接入 `handleSendFailure` 冷却触发点自动推送。
- **配置存储**：User 模型新增 `alertEnabled/alertChannelType/alertWebhook`，迁移 `20260724120016_add_user_alert_config`（开发库+测试库均已应用）。
- **API**：`GET/PATCH /api/user/alert-config`、`POST /api/user/alert-config/test`、`GET /api/user/sender-accounts/stats`（10 字段；todaySent/todayFailed 口径为今日 replies+dms 的 SENT/FAILED 数，failureRate=失败/(成功+失败)）、`POST /api/user/sender-accounts/bulk-status`（pause: ACTIVE→DISABLED，resume: DISABLED→ACTIVE）。
- **UI**：accounts 页顶部健康度看板（8 卡片 + 失败率 >=30% 红色警示）+「全部暂停/恢复」按钮（确认 Dialog，操作后刷新列表和看板）；settings 页「告警通知」区块（开关/渠道/Webhook/保存/发送测试）。
- **测试**：新增 26 用例（alert 模块 7 + alert-config 路由 8 + stats 4 + bulk-status 5 + 既有适配），**24 个文件 196 用例全部通过**。

### 验证

- `npx tsc --noEmit`：通过 ✅
- `npm run lint`：通过（0 error 0 warning）✅
- `npm test`：**通过 ✅**（24 个文件 196 个用例全部通过，2026-07-24 串行复跑确认）
- 环境：重启电脑后 WSL2/Docker 恢复，`docker compose up -d` 正常，主库与测试库迁移均已应用。

## 下次继续记录

- **当前分支**：`main`。
- **2026-08-12 商用试用了阻断项清理**：
  1. ✅ `sender_accounts.cookies` 加密落库（AES-256-GCM，`createAccount`/`updateAccount` 写入加密，发送队列 `resolveAccountCookies` 解密并兼容历史明文）——上线前必须项已消除。
  2. ✅ `.env.example` 补全：`PLATFORM_CREDENTIALS_ENCRYPTION_KEY`、`SENDER_HEADLESS`、`SENDER_DEBUG`、`DOUYIN_COOKIES` 等。
  3. ✅ 删除空 API 死目录（analyze/dm/stats/reply/send）。
  4. ✅ 测试基线恢复：196/196 通过（本地 Docker 库 15s）；新增 `TEST_DATABASE_URL` 支持无 Docker 时用云端库跑测试（Neon 项目 `kehuojingling-test`，连接串在 gitignore 的 `.env.test`）；`testTimeout` 放宽至 30s。
  5. ✅ `next build` 生产构建通过（44 页面，无错误无警告）。
- **2026-08-12 晚 部署路径定稿**：
  1. ✅ 废弃 Vercel（`vercel.json` 已删），Render Blueprint 为唯一部署路径：`render.yaml` 含 web + redis(noeviction) + PG，启动自动 `migrate deploy`；密钥值在 DEPLOY.md「生产密钥」节
  2. ✅ 生产模式实测通过：`next start` 下 注册→CSRF 登录→鉴权 API 200；创建发送账号 Cookie 密文落库直查验证（118 字符 iv:tag:data）
  3. ⚠️ 实测发现并修复：`.env` 缺 `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` 导致生产模式创建账号 500（已补）
  4. ✅ 代码已推送 GitHub main（d0455ef），可直接在 Render 创建 Blueprint
- **明天开工**：
  1. Render 创建 Blueprint（选本仓库），按 DEPLOY.md 填 sync:false 变量
  2. 抓取服务内网穿透后填 `SCRAPER_API_URL`；试用初期 `SENDER_PROVIDER=mock`
  3. 收集人工实测反馈，修复发现的问题
  4. 增强项（按需）：队列积压/失败率主动告警；UA 池随 Chrome 版本更新
  5. Phase 4（持续运营向）：Cookie 自动刷新、账号分组、话术 A/B 风控率、抓取-发送联动

## 开发命令

```bash
# 启动本地数据库和 Redis
cd /e/ai/YJ-HUOKE && docker compose up -d

# 一键启动 Next.js + 抓取服务（开发）
cd /e/ai/YJ-HUOKE && npm run dev:all

# 运行测试
cd /e/ai/YJ-HUOKE && npm test
```

## 已知问题 / 后续

- 百度指数 / 抖音热点宝当前为占位实现。
- 抖音自动回复 / 私信依赖真实 Cookie 和 Playwright，生产需单独维护。
- Cookie 在 `sender_accounts.cookies` 目前明文存储，`createAccount` 留有加密 TODO（`PLATFORM_CREDENTIALS_ENCRYPTION_KEY`），上线前必须补。
