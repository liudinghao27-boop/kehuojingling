# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-09-01

## 本次完成

### P1 修复 T7：发送链路改走队列（✅ 已完成并验证）

依据 `docs/plans/2026-08-29-p1-fixes.md` T7（计划最后一项，至此 P1 全部清零）：

- **四路由改入队**：`comments/[id]/reply`、`[id]/dm`、`batch/reply`、`batch/dm` 从同步直发改为 `addReplyJob`/`addDmJob`（`src/lib/queue/index.ts:525,553`）入队，返回 **202 `{ queued: true }`**。鉴权/归属/配额/合规/语义查重（409 CONTENT_TOO_SIMILAR）/种草生成全部保留同步；入队失败标 FAILED 并返回 503。`addReplyJob`/`addDmJob` 签名改为 `(commentId, recordId, accountId?)`；Redis 不可用时降级为 setTimeout 直跑 processSendJob（与 addScrapeJob 降级一致）。
- **前端适配**：comments 页提示改「已加入发送队列」语义（单条/批量），删除 202 下不存在的 502 FAILED 死代码分支。
- **幂等（P1-5）**：`processSendJob`（`src/lib/queue/index.ts:169`）以 `recordId` 定位路由已建 Reply/Dm 行；发送前检查同 comment 同类型 SENT 记录，有则短路 `already-sent` 并清理冗余 PENDING 行；成功/失败/合规拦截均更新同一行（`markRecordFailed`），Bull 重试复用同行，FAILED→SENT 可翻转。
- **配额口径（P1-2）**：`src/lib/plans/index.ts` `getCurrentUsage` 回复/私信从数 Activity 改为数 Reply/Dm 表今日 SENT 记录（`sentAt >= 今日0点`）；路由内写入队动作 Activity（metadata `queued: true`），发送成功 Activity 由 worker 落，dashboard 动态页两时点都合理。
- **原子化（P1-10）**：`account-pool.ts` 新增 `claimAccountSlot`——`updateMany` 条件原子认领（ACTIVE 且 dailySent < dailyLimit → increment 1），`pickAccount` 逐个候选认领、失败换下一个；`handleSendFailure`/`handleSendSuccess` 改原子增减 + `updateMany` 边界钳制（healthScore 钳 [0,100]）。**口径注意**：认领时即扣 dailySent，失败尝试也消耗日限额（防风控更安全，避免认领-失败-释放死循环），`handleSendSuccess` 不再重复计数。
- **consecutiveFailures（P1-7）**：`src/lib/scraper/index.ts` `scrapeAndSaveComments` 新增 `isFinalAttempt` 参数，仅 Bull 最终失败（`attemptsMade >= attempts - 1`）才递增计数/打 ERROR，单周期重试不再误伤视频状态。
- **测试**：重写 `process-send-job.test.ts`（18 用例：幂等短路、同行翻转、认领单扣、安全窗口等）；新增 `plans/index.test.ts`（7 用例）+ 四路由测试（32 用例，mock 队列断言入队与 202/503/409/403）；`account-pool.test.ts`、`scraper/index.test.ts` 适配新行为。

### 环境插曲（重要）

- Neon 云端测试库 schema 漂移：缺 `replies.mode` 列（迁移未应用、库内无 `_prisma_migrations` 表）。对**测试库**执行了 `prisma db push`（未动生产/开发库）。此前记录的 5 个「Prisma pg adapter 兼容」既有失败（process-send-job×4、sender-accounts stats×1）实为 schema 漂移所致，schema 同步后**全部转绿**，该技术债消除。

### 验证（全部实跑）

- `npx tsc --noEmit`：通过 ✅
- `npm run lint`：0 error 0 warning ✅
- `npm test`（Neon 测试库）：**40 个文件 306 用例全部通过** ✅（负责人复跑确认，488s）
- `npm run build`：通过 ✅（路由表正常，`Proxy (Middleware)` 生效）

## 下次继续记录

- **当前分支**：`main`。T1-T7 全部代码改动**尚未 commit/push**（含 T1-T6 与 T7），如需推送到 GitHub 再走提交流程（github.com 直连可能波动，必要时用 GitHub MCP push_files）。
- **部署**：T7 改了发送路由/队列/账号池核心链路，上线前建议在 Sealos 云端做一轮真实冒烟（入队 → worker 发出 → Reply/Dm 状态翻转 → 动态页两条记录）；生产 Redis 为 noeviction 已在 render/sealos 配置中。
- **已知限制**：
  - PENDING 行在队列延迟期（回复 30s/私信 60s）会出现在评论「展开记录」里，与「已加入发送队列」语义自洽。
  - 配额检查在入队时点（SENT 口径），极端并发下可能瞬时超入队（计划指定口径，接受）。
  - Redis 降级直跑模式无 Bull limiter，进程重启任务丢失（与既有 addScrapeJob 降级同级风险）。
  - `sender/index.ts` 的 `sendReplyToPlatform`/`sendDmToPlatform` 现已无调用方，保留未删（避免扩大改动面），后续可清理。
- **历史待办（仍有效）**：
  - 种草 fallback 句式库仅 5 条，无 AI key 时同评论重复种草可能撞同一句。
  - 演示账号未配 DOUYIN Cookie，真实发送需用户在设置页配置平台 Cookie。
  - 增强项（按需）：队列积压/失败率主动告警；UA 池随 Chrome 版本更新；Phase 4（Cookie 自动刷新、账号分组、话术 A/B 风控率、抓取-发送联动）。

## 开发命令

```bash
# 启动本地数据库和 Redis
cd /e/ai/YJ-HUOKE && docker compose up -d

# 一键启动 Next.js + 抓取服务（开发）
cd /e/ai/YJ-HUOKE && npm run dev:all

# 运行测试（无 Docker 时用 .env.test 的 Neon 云端测试库）
cd /e/ai/YJ-HUOKE && npm test
```

## 已知问题 / 后续

- 百度指数 / 抖音热点宝当前为占位实现。
- 抖音自动回复 / 私信依赖真实 Cookie 和 Playwright，生产需单独维护。
- ~~发送链路同步直发~~ → 已队列化（T7），账号池轮换、日限额、熔断、Bull limiter、安全窗口现已真正生效。
