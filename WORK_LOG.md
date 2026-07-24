# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-07-24

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

- `npx tsc --noEmit`：通过 ✅
- `npm run lint`：通过（0 error 0 warning）✅
- `npm test`：**通过 ✅**（16 个文件 137 个用例全部通过，2026-07-24，迁移应用后）
- 环境：重启电脑后 WSL2/Docker 恢复，`docker compose up -d` 正常，主库与测试库迁移均已应用。

## 下次继续记录

- **当前分支**：`main`
- **最近三次提交**：
  1. `175a184 feat: sender account pool with circuit breaker and compliance gating (Phase 1)`
  2. `c5d0f79 docs: update WORK_LOG with Phase 1-3 completion and commits`
  3. `6f2792c feat: integrate real index API for keyword scoring (Phase 3)`
- **未提交改动**：账号管理 UI（`dashboard/accounts/page.tsx` + Navbar）+ 计划文档勾选（测试已通过，待提交）
- **下一步**：
  1. 提交账号管理 UI → **Phase 1 全部完成**
  2. Phase 2：行为拟人化（`simulateHumanBrowsing`/`humanType`）+ 代理池 + UA/指纹伪装 + 安全时间窗口
  3. Phase 3：监控告警 + 健康度看板

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
