# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-09-07（TikHub 适配层已完成并全量测试通过：TikHub 主数据源 + 自建爬虫 fallback，待部署）

## 09-07 晚补充六：TikHub 适配层实现（✅ 已完成，TDD）

- **改动**（计划：`docs/plans/2026-09-07-tikhub-adapter.md`）：
  - `src/lib/scraper/douyin.ts`：抖音评论抓取改为 **TikHub 主调（`TIKHUB_API_KEY` Bearer 认证，校验 HTTP 200 + body code===200）→ 失败自动 fallback 自建爬虫**；aweme_id 解析改为数字 ID 直取 → 短链本地 follow 302 → hybrid 兜底（不再依赖爬虫 hybrid 接口）；`apiEndpoint` 改可选惰性求值，**仅配 TikHub 不配 SCRAPER_API_URL 也能工作**；评论字段映射抽取共用（TikHub/自建结构一致）；快手/视频号路径不变
  - `src/lib/scraper/douyin.test.ts`：重写 scrapeCommentsReal 测试（旧测 4 个适配新流程）+ 新增 TikHub 块 6 用例（主调/短链解析/HTTP 500 fallback/code≠200 fallback/仅 TikHub/双源皆无报错）
  - `.env.example` + `ENV_CONFIG.md`：补 `TIKHUB_API_KEY` 说明；真实 key 已写入 `.env`（gitignore 覆盖 `.env*`，不进仓库）
- **验证（全部实跑）**：
  - 新测试先红（11 失败）后绿，`src/lib/scraper/` 目录 31/31 通过
  - `npx tsc --noEmit` ✅、`npm run lint` ✅ 0 警告
  - **真实调用 e2e**（消耗免费额度 $0.002，临时测试文件用后已删）：数字 ID 链接 → TikHub 50 条评论字段正确；分享短链 → 本地 302 解析 → TikHub 50 条，两路径全通
  - **全量 `npx vitest run`：319/319 用例通过**（40/41 文件；唯一失败文件是 afterAll 清库在 Neon 上偶发超时的环境 flake，与本次改动无关）
- **⚠️ 测试环境注意**：vitest 不会自动加载 `.env.test` 到 `process.env`，`npm test` 前需 `export TEST_DATABASE_URL=$(grep '^TEST_DATABASE_URL=' .env.test | cut -d= -f2- | tr -d "\"'")`，否则会去打未启动的本地 Docker 库报空错误
- **部署步骤（下次）**：commit → push（github.com 被墙则 `node scripts/debug/api_push.mjs`）→ CI 构建 → **Sealos `kehuojingling` 应用环境变量加 `TIKHUB_API_KEY`** → 重启生效。不配 key 直接部署也安全（行为=现状自建爬虫路径）

## 09-07 晚补充五：TikHub 免费额度实测（用户已提供 key，未充值）

- **接口**：`GET https://api.tikhub.io/api/v1/douyin/web/fetch_video_comments?aweme_id=<id>&cursor=<n>&count=50`，认证 `Authorization: Bearer <key>`
- **实测结果**（测试视频 aweme_id=7661929820783168811，本机无 VPN 直连）：
  - 3/3 全成功，HTTP 200，`code:200`，单请求 ~7-8s（TikHub 侧实时采集，后台队列任务可接受）
  - 分页正常：cursor=0 → 50 条 has_more=1；cursor=50 → 31 条 has_more=0；cursor=100 → 0 条（total 117 含楼中楼，属正常口径差异）
  - **数据结构与自建爬虫逐字段一致**（cid/text/digg_count/create_time/user.nickname，首条评论均为同一条）→ 适配层改动极小
- **计费确认**：每次成功请求计费 $0.001（响应 message 明示），免费额度 $0.05 = 50 次，本次测试消耗 ~5 次
- **⚠️ key 安全**：key 只在对话和本地环境变量流转，**未写入 WORK_LOG/代码/git**；正式接入时写 `.env` 的 `TIKHUB_API_KEY`（已 gitignore），云端配 Sealos 环境变量
- **URL 解析注意**：现有流程靠自建爬虫 hybrid 接口把分享短链解析成 aweme_id；接 TikHub 后改为本地 follow 短链 302 重定向提取（非签名接口，任意 IP 可用），aweme_id 之后的评论拉取全走 TikHub

## 09-07 晚补充四：TikHub 跨境连通性实测（回应「用 TikHub 考虑 VPN 没有」）

- **本机无 VPN 直连**：tikhub.io 200（~2-3s）、api.tikhub.io 200（~1s）✅
- **云端 pod 直连**（`kubectl exec` 进 scraper pod 用 python httpx 实测）：tikhub.io 200（~1.1-1.5s）、api.tikhub.io 200（~0.9-1.9s），3 次全通 ✅
- **结论**：TikHub 对中国境内直连做了优化（或有 CN 友好 CDN），**Sealos 杭州集群无需任何代理即可调用**，~1-2s 延迟对后台队列抓取任务无影响。VPN 不是 TikHub 方案的前置条件
- 待用户动作：注册 tikhub.io 拿 API key（送 $0.05）；支付方式（国际卡/支付宝）待注册时确认

## 09-07 晚补充三：云端复测结果（关 VPN 直连恢复后）

- **Sealos 恢复**：关 VPN 后 `hzh.sealos.run:6443` 与应用域名直连均恢复（kubeconfig 未过期，kubectl 直接可用）。证实白天不可达是本机出口链路干扰
- **云端爬虫复测**（`kubectl port-forward svc/kehuojingling-scraper-8000-mifviyuvuoco-service 18000:8000`）：
  - T1 视频详情：第一次 400（日志确认抖音回 **403**），重试后 200
  - T2 分享短链：第一次 400（抖音 403），重试后 200
  - T3 评论拉取 50 条：200 正常
  - **8 连发实测：5 成 3 败（成功率 ~62%）**——抖音对 Sealos 出口 IP 是**间歇性软封禁**（部分请求 403），不是硬封。Bull 队列 3 次重试可掩盖到单任务 ~95% 成功，但仍有 ~5% 任务终败并累加 consecutiveFailures
- **结论**：业务链路当前「带病可用」，但 ~37% 的单请求失败率对商业产品不可接受——住宅代理（应急）+ TikHub 主数据源（商用前）路线不变，且宜尽快执行

## 09-07 晚补充二：商业化路线决策（用户要求从商业应用软件角度评估）

- **定性**：自建爬虫+机房 IP 被封是**周期性结构风险**，每封一次 = 全量客户采集停摆 = SLA 事故。方案 B（爬虫回本机）商用角度直接排除（开发者笔记本当生产单点，无法承诺任何稳定性）
- **关键价格数据**：
  - **TikHub**（[定价](https://tikhub.io/zh/pricing)）：~$0.001/次、**失败不计费**、注册送 $0.05；评论接口 2026-07 经[第三方实测可用](https://github.com/xinyuxinsheng/douyin-local-ops-skill)。成本测算：每客户每天监控 100 视频 ≈ $0.1/天 ≈ **¥0.7/天/客户**，可把"追抖音算法迭代"的无底洞研发成本变为固定 COGS
  - **住宅代理** 2026 行情：静态住宅 ¥50-100/IP/月（¥15/月的低价基本是机房冒充，[横评](https://www.90daili.com/article/7/409.html)）；动态住宅按流量，评论只传 JSON 流量极小
- **合规红线（商用前必审）**：批量采集评论（含昵称=个人信息）用于营销获客，触及《个人信息保护法》《反不正当竞争法》灰色地带，抖音对商业爬虫有胜诉判例；**付费产品风险主体是公司**。官方开放平台 API 只覆盖自有企业号评论，覆盖不了"别人视频找客户"核心场景。工程缓解：只采公开数据、限速、最小化存储、用户协议明示。发送端架构合规（用户自己 Cookie 操作自己账号）
- **最终路线（三段式）**：
  1. **应急**：Sealos 恢复后配住宅代理（方案 A，¥100 内）恢复服务，或观察 IP 封禁自愈
  2. **商用前必做**：**接 TikHub 作主数据源，自建爬虫降级为 fallback**（爬虫再封客户无感知）；与既有待办「队列积压/失败率主动告警」捆绑实施——商业产品监控告警和数据源冗余要一起上
  3. **发送端**：维持 mock → 商用前完成 real Cookie 端到端验证（原有待办不变）

## 09-07 晚补充：开源社区调研结论（开 VPN 后）

- **上游无修复可升**：Evil0ctal 仓库最新 release 仍是我们用的 **V4.1.2**（2025-03），项目此后基本停更；[issue #600](https://github.com/Evil0ctal/Douyin_TikTok_Download_API/issues/600) 与我们的报错逐字相同，无官方修复
- **第三方独立证实「封在 IP+会话层」**：2026 年仍在维护的 Go 项目 [tamnd/douyin-cli](https://github.com/tamnd/douyin-cli) 完整重实现了 a_bogus 签名 + 新鲜 msToken，其文档明说——**从机房/非中国 IP 调用抖音签名接口，一律返回空 body 或 `__ac` 验证壳，签名正确也没用，"the wall is at the IP and session layer"**；从中国住宅 IP 则正常。与我们 9-7 白天的对照实验结论完全一致
- **2026 社区共识**（[CSDN 抖音采集方案研究](https://blog.csdn.net/cmdos/article/details/157471716) 等）：纯签名逆向已死路，算法迭代快+指纹/ Cookie 校验；可行路线只有三类——
  1. **住宅代理出口**（改动最小：`scraper-cloud/crawlers/douyin/web/config.yaml` 的 `TokenManager.douyin.proxies.http/https` 已原生支持，填上即可，tiktok 段同理）
  2. **爬虫撤回住宅 IP 机器**（本机 9-7 实测全绿，恢复旧的隧道方案把本地爬虫暴露给云端主应用；零成本、今天就能恢复业务，代价是本机需常驻）
  3. **浏览器中继**（WebSocket 把请求交给真实浏览器发，天然带签名+Cookie+指纹；重，规模化时再考虑。项目已有 Playwright 发送端基建可复用）
- **备选实现留存**：douyin-cli 有 Docker 镜像和 HTTP serve 模式（`douyin serve`，含 comments 命令），将来 Python 爬虫因算法更新失效时可替换——但同样受 IP 层限制，不是当前解药
- **douyin-comment-standalone**（PyPI，2026-07）是 Playwright 发评论工具，与我们的发送端同路线，可作真实发送验证的参考实现
- **VPN 注意**：VPN 出口在境外，百度/Sealos 等国内站走代理反而不通；GitHub 此番经代理也不通（000），调研是走内置搜索完成的。Sealos 恢复仍需**直连**链路正常

## 本次完成

### 1. 爬虫「无效响应类型 NoneType」根因定位（✅ 代码层根因已确认）

- 报错链路：`crawlers/base_crawler.py` `get_fetch_data` 循环内，抖音返回的非 2xx 状态码走 `handle_http_status_error`——**302 直接 `pass` 不抛出，其余未列状态（含 400）抛 `APIResponseError` 但被外层 `except APIError: display_error()` 吞掉不重抛** → 两种情况下重试耗尽后函数隐式返回 `None` → `parse_json` 打出「无效响应类型 NoneType」再抛 `APIResponseError` → scraper 对主应用返回 400
- 即：该报错 = **抖音 web 端点对云端请求返回了 302（风控跳转验证码/登录页）或 400（签名/风控拒绝）**，不是爬虫代码 bug

### 2. 本地对照实验：同代码同配置本地全部正常（✅）

- 本地启动 `E:/ai/Douyin_TikTok_Download_API`（`.venv` + `start.py`，端口 8000），与云端 `scraper-cloud` 目录 `config.yaml` **逐字节一致**（`diff` 为空，均无代理设置；抖音 Cookie 同为上游 2025-03 的默认值）
- 实测全绿：
  - `GET /api/hybrid/video_data?url=https://www.douyin.com/video/7661929820783168811` → 200 完整数据（8-29 云端还正常的那条视频）
  - `GET /api/hybrid/video_data?url=https://v.douyin.com/fb69V8PQhFI/`（分享短链格式）→ 200
  - `GET /api/douyin/web/fetch_video_comments?aweme_id=7661929820783168811&count=50` → 200，`status_code:0`，评论返回正常（含 9 月新评论）
- **结论**：抖音 API 未变、爬虫代码未坏、视频链接未失效。同一代码+配置在住宅宽带（本机）正常、在 Sealos 机房出口 IP 被 302/400 → **基本坐实云端出口 IP 被抖音风控**（8-29 同 IP 还能抓，之后被封，符合机房 IP 无 Cookie 高频抓取的封禁画像）

### 3. 阻塞：Sealos 整体从本机不可达（⚠️ 未解决）

- `hzh.sealos.run:6443`（kubeconfig 在 `D:\Backup\Downloads\kubeconfig.yaml`）与 `ejahosctpwsb.sealoshzh.site` **TLS handshake 全部失败**（curl exit 35，重试 5+ 次、TLS1.2 均 000）；DNS 解析正常（阿里云杭州 IP）
- 与 9-1 记录的 github.com 被墙同形态，疑似链路干扰；9-1 当天 Sealos 是可用的，可能间歇性
- **因此云端复测（换热门视频直连云端爬虫）与滚动重启本次都做不了**

## 下次继续记录

- **~~第一优先：恢复 Sealos 访问~~** ✅ 已完成（9-7 晚，关 VPN 直连恢复，kubeconfig 未过期）。经验：Sealos 不可达时先关 VPN 再排查；`localStorage.session` 取新 kubeconfig 的方法备用
- **~~云端复测~~** ✅ 已完成（9-7 晚）：间歇性软封禁，单请求成功率 ~62%，详见「晚补充三」
- **待执行修复（按 9-7 商业化决策，按序）**：
  1. **~~商用前必做：接 TikHub 作主数据源~~** ✅ 代码已完成（9-7 晚，见「晚补充六」）。**剩余部署动作**：commit/push 本批改动 → Sealos `kehuojingling` 环境变量加 `TIKHUB_API_KEY`（key 在用户手中/本地 .env，勿入 git）→ 重启应用 → 云端造一个视频任务实测 TikHub 链路
  2. **应急（仍建议做）**：**买住宅代理**给自建爬虫 fallback 用（用户动作：静态住宅 ¥50-100/IP/月，勿买 ¥15 级机房冒充货）→ 填入 `scraper-cloud/crawlers/douyin/web/config.yaml` 的 `TokenManager.douyin.proxies.http/https` → push 到 `kehuojingling-scraper` 仓库 main → 等镜像构建 → Sealos 重启该应用。fallback 也可用，TikHub 挂时客户无感知
  3. 顺便更新 `config.yaml` 里 2025-03 的过期抖音 Cookie（浏览器登录 douyin.com 复制；上游注释说只需改这一处）
  4. 与「队列积压/失败率主动告警」捆绑：TikHub 失败转 fallback 时目前只有 console.warn，商用前应接告警
- **Sealos 访问经验留存**：不可达时先关 VPN 再排查；浏览器 Sealos 桌面 `localStorage.session` 可取新 kubeconfig 覆盖 `D:\Backup\Downloads\kubeconfig.yaml`（DEPLOY.md 有过期经验）
- **当前分支**：`main`，本批改动（douyin.ts/douyin.test.ts/ENV_CONFIG.md/.env.example/docs/plans/WORK_LOG.md）待 commit；远端 e79cb4e + 082038b（tree 同源，github.com 恢复后 `git fetch && git reset --hard origin/main` 对齐）
- **本地未跟踪文件**：`scripts/debug/api_push.mjs`、`cloud_smoke_t7*.sh`（冒烟/推送工具，含一次性冒烟账号密码，不要 commit）
- **真实发送验证（仍待做）**：本次为 mock sender（`SENDER_PROVIDER=mock`）。真实抖音 Cookie + Playwright 发送尚未在云端端到端验证——商用前必做：设置页配真实 Cookie → 切 real → 观察 verifyDmSent/verifyReplyPublished
- **清理项（按需）**：`sender/index.ts` 的 `sendReplyToPlatform`/`sendDmToPlatform` 已无调用方可删；冒烟账号及其数据可清
- **历史待办（仍有效）**：种草 fallback 句式库仅 5 条；队列积压/失败率主动告警；UA 池随 Chrome 版本更新；仓库建议转 private（旧密钥在 git 历史）；Phase 4（Cookie 自动刷新、账号分组、话术 A/B 风控率、抓取-发送联动）

## 开发命令

```bash
# 启动本地数据库和 Redis
cd /e/ai/YJ-HUOKE && docker compose up -d

# 一键启动 Next.js + 抓取服务（开发）
cd /e/ai/YJ-HUOKE && npm run dev:all

# 单独启动本地抓取服务（排障用，端口 8000，文档 http://localhost:8000/docs）
cd /e/ai/Douyin_TikTok_Download_API && ./.venv/Scripts/python.exe start.py

# 运行测试（无 Docker 时用 .env.test 的 Neon 云端测试库）
cd /e/ai/YJ-HUOKE && npm test

# github.com 被墙时的 API 推送通道
cd /e/ai/YJ-HUOKE && node scripts/debug/api_push.mjs

# Sealos 集群访问
export KUBECONFIG="D:/Backup/Downloads/kubeconfig.yaml" && kubectl get pods
```

## 已知问题 / 后续

- 百度指数 / 抖音热点宝当前为占位实现。
- 抖音自动回复 / 私信依赖真实 Cookie 和 Playwright，生产需单独维护。
- ~~发送链路同步直发~~ → 已队列化（T7）并已上线；账号池轮换、日限额、熔断、Bull limiter、**北京时间安全窗口**均已真正生效。
- ~~安全窗口按服务器本地时区~~ → 已修复为北京时间（082038b）。
- **云端爬虫被抖音风控（302/400 → NoneType 报错）**：已定位为出口 IP 层封禁（代码/签名无问题，第三方独立佐证）。修复二选一：住宅代理出口 或 爬虫撤回本机走隧道（详见「下次继续记录」）。
- **Sealos 从本机 TLS 不可达**（2026-09-07 起，疑似链路干扰，间歇性）。
