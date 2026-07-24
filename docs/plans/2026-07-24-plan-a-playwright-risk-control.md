# 方案 A：Playwright + Cookie 风控工程化方案

> 目标：在不依赖官方 API 的前提下，把抖音自动化做到可商用水平。
> 核心思路：多账号分散风险 + 行为拟人化 + 熔断降级 + 内容合规前置。

---

## 一、当前基础盘点

| 模块 | 现状 | 缺口 |
|------|------|------|
| Cookie 管理 | 单 Cookie（`DOUYIN_COOKIES` 或 `credentials.cookies`） | 无多账号池、无健康度追踪、无自动轮换 |
| 浏览器生命周期 | 单上下文复用，支持持久化 profile | 无代理 IP、无指纹伪装、无并发隔离 |
| 延迟策略 | `randomDelay(30s-120s)` 用于回复/私信 | 无操作间微延迟、无浏览深度模拟、无时间分布 |
| 限流 | Redis 限流（reply 200/天，dm 50/天） | 无账号级限流、无平台级限流、无失败熔断 |
| 合规检查 | `checkCompliance()` 检测微信/手机号/诱导词 | 未在发送前强制拦截，无内容变体生成 |
| 错误处理 | 能识别登录/验证码弹窗 | 无风控类型细分、无自动暂停、无告警通知 |

---

## 二、架构改造：账号池 + 代理池 + 调度器

```
┌─────────────────────────────────────────────────────────────┐
│                        任务调度器                            │
│  （按账号健康度、平台限流、时间窗口分配任务）                  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ 账号 A  │          │ 账号 B  │          │ 账号 C  │
   │ Cookie  │          │ Cookie  │          │ Cookie  │
   │ 健康度95│          │ 健康度72│          │ 健康度30│  ← 熔断中
   └────┬────┘          └────┬────┘          └────┬────┘
        │                     │                     │
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ 代理IP1 │          │ 代理IP2 │          │ 代理IP3 │
   │ 住宅代理│          │ 移动代理│          │ 住宅代理│
   └─────────┘          └─────────┘          └─────────┘
```

---

## 三、模块细化

### 3.1 Cookie 池管理（`src/lib/sender/account-pool.ts`）

**功能：**
- 多账号 Cookie 存储、加密、轮换
- 账号健康度评分（0-100）
- 自动熔断与恢复

**Schema 变更：**

```prisma
model SenderAccount {
  id            String   @id @default(cuid())
  userId        String
  platform      Platform @default(DOUYIN)
  label         String   // 账号备注，如"主号""小号1"
  cookies       String   @db.Text // 加密存储
  proxyUrl      String?  // 绑定代理
  status        AccountStatus @default(ACTIVE)
  healthScore   Int      @default(100) // 0-100
  failCount     Int      @default(0)   // 连续失败次数
  lastFailAt    DateTime?
  lastSuccessAt DateTime?
  dailySent     Int      @default(0)   // 当日已发送
  dailyLimit    Int      @default(50)  // 账号日限额
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, platform, status])
  @@map("sender_accounts")
}

enum AccountStatus {
  ACTIVE      // 正常
  COOLING     // 冷却中（触发风控后暂停）
  DISABLED    // 手动禁用
  EXPIRED     // Cookie 过期
}
```

**核心逻辑：**

```typescript
// 账号选择策略：健康度 > 剩余额度 > 最近未使用
async function pickAccount(userId: string, platform: Platform): Promise<SenderAccount | null> {
  const accounts = await prisma.senderAccount.findMany({
    where: {
      userId,
      platform,
      status: 'ACTIVE',
      healthScore: { gte: 30 },        // 健康度底线
      dailySent: { lt: prisma.senderAccount.fields.dailyLimit },
    },
    orderBy: [
      { healthScore: 'desc' },
      { lastSuccessAt: 'asc' },        // 最久未用的优先
    ],
  });
  return accounts[0] ?? null;
}

// 失败处理：降健康度、可能熔断
async function handleSendFailure(accountId: string, error: string) {
  const account = await prisma.senderAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const isRiskControl = /验证码|验证|登录|封禁|限制/.test(error);
  const newScore = Math.max(0, account.healthScore - (isRiskControl ? 20 : 5));
  const newFailCount = account.failCount + 1;

  // 连续失败 3 次或健康度 < 30 → 冷却 2 小时
  const shouldCooling = newFailCount >= 3 || newScore < 30;

  await prisma.senderAccount.update({
    where: { id: accountId },
    data: {
      healthScore: newScore,
      failCount: newFailCount,
      lastFailAt: new Date(),
      status: shouldCooling ? 'COOLING' : 'ACTIVE',
    },
  });

  if (shouldCooling) {
    // 2 小时后自动恢复
    await scheduleAccountRecovery(accountId, 2 * 3600 * 1000);
    // 触发告警（邮件/钉钉/企业微信）
    await notifyAccountCooling(account.userId, account.label, error);
  }
}
```

### 3.2 代理 IP 池（`src/lib/sender/proxy-pool.ts`）

**方案选择：**

| 类型 | 成本 | 稳定性 | 适用场景 |
|------|------|--------|----------|
| 住宅代理（如 Bright Data、Oxylabs） | 高 | 高 | 主账号、高价值操作 |
| 移动代理（如 4G/5G 代理） | 中高 | 中高 | 私信、敏感操作 |
| 机房代理（如阿里云、腾讯云） | 低 | 低 | 抓取、低频操作 |
| 自建代理池（ADS L/软路由） | 中 | 中 | 长期运营、多账号 |

**建议：** 初期用机房代理 + 少量住宅代理混合，主账号用住宅代理。

**集成方式：**

```typescript
// launchContext 改造
async function launchContext(account: SenderAccount): Promise<LaunchResult> {
  const proxy = account.proxyUrl ? parseProxyUrl(account.proxyUrl) : null;

  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: isHeadless(),
    ...(proxy && {
      proxy: {
        server: proxy.server,
        username: proxy.username,
        password: proxy.password,
      },
    }),
  };

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // 指纹伪装
    userAgent: getRandomUserAgent(),
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });

  // 注入 stealth 脚本（需额外依赖 playwright-extra-plugin-stealth）
  await injectStealth(context);

  return { browser, context };
}
```

### 3.3 行为拟人化增强

**当前问题：** `randomDelay` 只在发送前等待，操作过程过于机械。

**改造点：**

```typescript
// 1. 页面浏览深度模拟（打开视频后先模拟真实浏览）
async function simulateHumanBrowsing(page: Page) {
  // 随机滚动 2-5 次
  const scrolls = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < scrolls; i++) {
    const distance = 300 + Math.random() * 500;
    await page.mouse.wheel(0, distance);
    await randomDelay(800, 2000);
  }

  // 随机鼠标移动
  const viewport = page.viewportSize();
  if (viewport) {
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(
        Math.random() * viewport.width,
        Math.random() * viewport.height,
        { steps: 10 }
      );
      await randomDelay(200, 500);
    }
  }

  // 随机点赞/取消（可选，高风险操作慎用）
  // await page.locator('[data-e2e="like-icon"]').first().click().catch(() => {});
}

// 2. 打字速度模拟（fill 替换为逐字输入）
async function humanType(page: Page, selector: string, text: string) {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 150 });
    if (Math.random() < 0.05) {
      // 5% 概率停顿
      await randomDelay(300, 800);
    }
  }
}

// 3. 操作时间分布（避开平台风控高峰期）
function getNextSendTime(): Date {
  const now = new Date();
  const hour = now.getHours();

  // 抖音风控高峰期：凌晨 2-6 点、早 8-9 点、午 12-14 点、晚 20-22 点
  // 安全窗口：上午 10-11 点、下午 15-17 点、晚上 19-20 点
  const safeHours = [10, 11, 15, 16, 17, 19, 20];

  if (safeHours.includes(hour)) {
    // 当前在安全窗口，延迟 5-30 分钟
    return new Date(now.getTime() + (5 + Math.random() * 25) * 60 * 1000);
  }

  // 否则推到下一个安全窗口
  const nextSafeHour = safeHours.find(h => h > hour) ?? safeHours[0] + 24;
  const target = new Date(now);
  target.setHours(nextSafeHour % 24, Math.floor(Math.random() * 60), 0, 0);
  if (nextSafeHour > 24) target.setDate(target.getDate() + 1);
  return target;
}
```

### 3.4 熔断降级与队列改造（`src/lib/queue/index.ts`）

**当前问题：** 队列直接执行任务，无账号选择、无失败熔断、无优先级。

**改造：**

```typescript
// 队列任务数据结构
interface SendJobData {
  commentId: string;
  templateId: string;
  accountId?: string;      // 指定账号，不指定则自动选择
  priority?: number;       // 1-10，默认 5
  scheduledAt?: Date;      // 定时发送
}

// 发送处理器（reply/dm 通用）
async function processSendJob(job: Bull.Job<SendJobData>, type: 'reply' | 'dm') {
  const { commentId, templateId, accountId } = job.data;

  // 1. 获取评论和用户信息
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { video: { include: { user: true } } },
  });
  if (!comment) throw new Error('评论不存在');

  const userId = comment.video.userId;

  // 2. 选择发送账号
  const account = accountId
    ? await prisma.senderAccount.findUnique({ where: { id: accountId } })
    : await pickAccount(userId, 'DOUYIN');

  if (!account) {
    // 无可用账号，延迟重试
    throw new Error('无可用发送账号，请检查账号池状态');
  }

  // 3. 内容合规检查（发送前强制拦截）
  const template = await prisma.replyTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error('模板不存在');

  const compliance = checkCompliance(template.content);
  if (!compliance.compliant) {
    // 自动改写为合规话术
    template.content = generateCompliantVariant(template.content);
    // 或记录日志并跳过
    await prisma.activity.create({
      data: {
        type: 'ERROR',
        description: `内容合规拦截：${compliance.issues.join('；')}`,
        userId,
      },
    });
    return { skipped: true, reason: 'compliance' };
  }

  // 4. 执行发送
  const provider = getSenderProvider(comment.video.platform);
  const result = type === 'reply'
    ? await provider.sendReply({
        videoUrl: comment.video.url,
        content: template.content,
        authorName: comment.authorName,
        commentContent: comment.content,
        credentials: { cookies: account.cookies },
      })
    : await provider.sendDm({
        videoUrl: comment.video.url,
        content: template.content,
        authorName: comment.authorName,
        commentContent: comment.content,
        credentials: { cookies: account.cookies },
      });

  // 5. 结果处理
  if (result.success) {
    await prisma.senderAccount.update({
      where: { id: account.id },
      data: {
        dailySent: { increment: 1 },
        lastSuccessAt: new Date(),
        failCount: 0,
        healthScore: Math.min(100, account.healthScore + 2), // 成功回血
      },
    });
    // 更新评论状态...
  } else {
    await handleSendFailure(account.id, result.error ?? '未知错误');
    throw new Error(result.error); // 触发 Bull 重试
  }

  return result;
}

// 队列配置：按账号隔离 + 限流
const replyQueue = new Bull('reply', {
  redis: bullRedis,
  limiter: {
    max: 10,           // 每 duration 最多 10 个任务
    duration: 60000,   // 每分钟
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: true,
    removeOnFail: false, // 保留失败任务便于排查
  },
});
```

### 3.5 内容安全审核前置

**当前问题：** `checkCompliance` 只在工具函数里，未强制接入发送流程。

**改造：**

```typescript
// 在模板保存时即做合规检查
export async function createTemplate(userId: string, data: TemplateInput) {
  const compliance = checkCompliance(data.content);
  if (!compliance.compliant) {
    throw new Error(`内容不合规：${compliance.issues.join('；')}`);
  }
  return prisma.replyTemplate.create({ data: { ...data, userId } });
}

// 发送前二次检查 + 智能改写
function generateCompliantVariant(original: string): string {
  let result = original;

  // 微信 → 引导话术
  result = result.replace(/微信[号]?[：:]?\s*\S+/g, '看我主页简介');
  result = result.replace(/加微[信]?/g, '私信交流');
  result = result.replace(/\+V/gi, '私信我');

  // 手机号 → 删除
  result = result.replace(/1[3-9]\d{9}/g, '');

  // 诱导词 → 中性表达
  result = result.replace(/点击链接/g, '查看主页');
  result = result.replace(/立即购买/g, '了解更多');
  result = result.replace(/限时优惠/g, '欢迎关注');
  result = result.replace(/免费赠送/g, '资料分享');

  return result;
}

// 敏感词库（可扩展）
const SENSITIVE_WORDS = [
  '兼职', '刷单', '返利', '赌博', '彩票', '贷款',
  '加V', 'VX', '威信', '企鹅', 'QQ号',
];

function containsSensitiveWord(text: string): string[] {
  return SENSITIVE_WORDS.filter(word => text.includes(word));
}
```

### 3.6 监控告警（`src/lib/monitor/alert.ts`）

```typescript
// 告警渠道
interface AlertChannel {
  type: 'email' | 'dingtalk' | 'wecom' | 'webhook';
  config: Record<string, string>;
}

// 告警规则
const ALERT_RULES = {
  accountCooling: { level: 'warning', message: '账号触发风控进入冷却' },
  accountExpired: { level: 'critical', message: '账号 Cookie 过期' },
  dailyQuotaExhausted: { level: 'info', message: '当日额度已用完' },
  queueBacklog: { level: 'warning', message: '队列积压超过 100 条' },
  sendFailureRate: { level: 'critical', message: '发送失败率超过 30%' },
};

// 发送告警
async function sendAlert(rule: keyof typeof ALERT_RULES, context: Record<string, unknown>) {
  const ruleConfig = ALERT_RULES[rule];
  const channels = await getAlertChannels(); // 从用户配置读取

  for (const channel of channels) {
    switch (channel.type) {
      case 'dingtalk':
        await sendDingTalkAlert(channel.config.webhook, ruleConfig, context);
        break;
      case 'wecom':
        await sendWeComAlert(channel.config.webhook, ruleConfig, context);
        break;
      case 'email':
        await sendEmailAlert(channel.config, ruleConfig, context);
        break;
    }
  }
}
```

---

## 四、实施路线图

### Phase 1：账号池 + 基础熔断（1-2 周）

- [x] 新增 `SenderAccount` 模型 + 迁移（`prisma/migrations/20260724182534_add_sender_accounts`，待数据库恢复后 `prisma migrate deploy` 应用）
- [x] 实现 `pickAccount` / `handleSendFailure`（`src/lib/sender/account-pool.ts`，含测试 `account-pool.test.ts`）
- [x] 队列处理器接入账号选择（`src/lib/queue/index.ts` 的 `processSendJob`，含限流与维护队列）
- [x] 发送前强制合规检查（`src/lib/safety/compliance.ts` 扩展 + 队列内拦截与自动改写）
- [x] 账号管理 UI（`/dashboard/accounts`）

### Phase 2：行为拟人化 + 代理（1-2 周）

- [ ] `simulateHumanBrowsing` / `humanType`
- [ ] 代理池集成（支持 HTTP/SOCKS5）
- [ ] User-Agent 池 + 指纹伪装
- [ ] 安全时间窗口调度

### Phase 3：监控告警 + 运营工具（1 周）

- [ ] 账号健康度看板
- [ ] 告警渠道接入（钉钉/企业微信）
- [ ] 失败率统计报表
- [ ] 一键暂停/恢复所有账号

### Phase 4：规模化（持续）

- [ ] Cookie 自动刷新（扫码登录后自动更新）
- [ ] 账号分组策略（按业务线隔离）
- [ ] A/B 测试不同话术的风控触发率
- [ ] 与抓取服务联动（抓取频率自适应发送能力）

---

## 五、风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| 抖音风控升级，Playwright 大面积失效 | 中 | 准备移动端方案（Appium/ADB）作为 fallback |
| 代理 IP 成本高企 | 高 | 混合代理策略，主账号住宅 + 小号机房 |
| 客户账号被封引发投诉 | 中 | 服务协议明确风险自担 + 提供多账号分散建议 |
| 内容合规问题导致法律风险 | 低 | 强制合规检查 + 敏感词库 + 用户协议免责 |

---

## 六、关键依赖

```json
{
  "dependencies": {
    "playwright-extra": "^4.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2"
  }
}
```

> `playwright-extra` + `stealth` 插件可显著降低被检测概率。
