# 工作记录 - 获客精灵

> 仅保留最近一次工作记录，每次保存自动覆盖。

## 最后状态：2026-09-07（✅ 爬虫风控问题闭环：TikHub 主数据源已上线云端，生产 e2e 通过——加视频 10 秒入库 50 条真实评论）

## 本次完成

### 1. 云端爬虫「无效响应类型 NoneType」根因定位（✅）

- 报错链路：`scraper-cloud/crawlers/base_crawler.py` 的 `get_fetch_data` 循环内，抖音返回的非 2xx 走 `handle_http_status_error`——**302 直接 `pass` 不抛出，其余未列状态（含 400）抛 `APIResponseError` 但被外层 `except APIError` 吞掉不重抛** → 重试耗尽后函数隐式返回 `None` → `parse_json` 打出「无效响应类型 NoneType」→ scraper 对主应用返回 400
- 即：该报错 = **抖音对云端请求返回 302（风控跳转）或 400（签名/风控拒绝）**，不是爬虫代码 bug

### 2. 本地对照实验：坐实 IP 层风控（✅）

- 本地启动 `E:/ai/Douyin_TikTok_Download_API`（端口 8000），与云端 `scraper-cloud` 的 `config.yaml` **逐字节一致**（均无代理、同为上游 2025-03 默认 Cookie）
- 本地全绿：hybrid 视频详情（数字 ID 链接 + 分享短链）、评论拉取 50 条均 200
- 云端复测（port-forward 直连）：**8 连发 5 成 3 败，成功率 ~62%，抖音回 403**——间歇性软封禁（8-29 同 IP 还能正常抓，之后被封）。同代码同配置住宅 IP 正常、机房 IP 被拒 → **出口 IP 层风控坐实**

### 3. 开源社区调研：IP 层封禁获第三方独立佐证（✅）

- 上游 Evil0ctal 最新 release 仍是我们用的 V4.1.2（2025-03），项目停更，无修复可升；[issue #600](https://github.com/Evil0ctal/Douyin_TikTok_Download_API/issues/600) 与我们报错逐字相同
- 2026 活跃项目 [tamnd/douyin-cli](https://github.com/tamnd/douyin-cli)（完整重实现 a_bogus + 新鲜 msToken）文档明说：**机房/非中国 IP 调抖音签名接口一律返回空 body 或 `__ac` 验证壳，"the wall is at the IP and session layer"**——签名再对也没用
- 社区共识：纯签名逆向是死路；可行路线 = 住宅代理 / 住宅 IP 部署 / 浏览器中继（[CSDN 方案研究](https://blog.csdn.net/cmdos/article/details/157471716)）
- 备选留存：douyin-cli 有 Docker 镜像 + HTTP serve 模式，将来 Python 爬虫算法失效时可替换（同样受 IP 限制）；[douyin-comment-standalone](https://pypi.org/project/douyin-comment-standalone/)（Playwright 发评论）可作发送端参考

### 4. 商业化路线决策（✅ 用户确认方向）

- 定性：自建爬虫+机房 IP 被封是**周期性结构风险**，每封一次 = 全量客户停摆 = SLA 事故；爬虫回开发机方案商用角度排除（笔记本当生产单点）
- **TikHub**：~$0.001/次、**失败不计费**、评论接口 2026-07 有[第三方实测可用](https://github.com/xinyuxinsheng/douyin-local-ops-skill)佐证；成本 ≈ **¥0.7/天/客户**（按每天监控 100 视频），把"追抖音算法迭代"的无底洞研发变为固定 COGS
- **合规红线（商用前必审）**：批量采集评论（含昵称=个人信息）营销获客触及个保法/反不正当竞争灰色地带，抖音对商业爬虫有胜诉判例，付费产品风险主体是公司；官方开放平台只覆盖自有企业号评论。缓解：只采公开数据、限速、最小化存储、用户协议明示。发送端合规（用户自己 Cookie 操作自己账号）
- 路线：**TikHub 主数据源 + 自建爬虫 fallback**；住宅代理（静态 ¥50-100/IP/月，勿买 ¥15 级机房冒充货）作为 fallback 线路的加固

### 5. TikHub 适配层实现（✅ TDD，commit `edf666a`，计划 `docs/plans/2026-09-07-tikhub-adapter.md`）

- `src/lib/scraper/douyin.ts`：抖音评论改 **TikHub 主调（`TIKHUB_API_KEY` Bearer，校验 HTTP 200 + body code===200）→ 失败自动 fallback 自建爬虫**；aweme_id 解析改为数字 ID 直取 → 短链本地 follow 302 → hybrid 兜底；`apiEndpoint` 改可选惰性求值，**仅配 TikHub 不配 SCRAPER_API_URL 也能工作**；字段映射两源共用；快手/视频号路径不变
- 测试：重写 scrapeCommentsReal 测试 + 新增 TikHub 6 用例；先红（11 败）后绿，scraper 目录 31/31；`tsc`/`lint` 全过；**全量 319/319 通过**（40/41 文件，唯一失败是 Neon 清库偶发超时的环境 flake）
- 真实调用 e2e（本地，免费额度 $0.002）：数字 ID 链接与分享短链两路径各拉 50 条真实评论，字段映射正确
- `TIKHUB_API_KEY` 已写入本地 `.env`（gitignore `.env*` 覆盖，不进仓库）；`.env.example`/`ENV_CONFIG.md` 补了说明（两者均被 gitignore 刻意排除，仅本地）

### 6. 部署上线 + 生产 e2e（✅）

- 推送：github.com 直连被墙 → `api_push.mjs`（api.github.com Git Data API）续推成功，远端 `f0ed3dd` → 补推 `9ab3da3`，tree 与本地逐字段校验一致。顺手修复脚本续推判定：原先只比 HEAD^ 单层 tree，多提交时误判 diverged，改为祖先链回溯 20 层（脚本已入库）
- CI：f0ed3dd **CI Test ✅ + Build & Push Docker Image ✅**
- Sealos：`kubectl set env deployment/kehuojingling TIKHUB_API_KEY=***` → 滚动更新成功。⚠️ **该变量是 kubectl 直改，日后在 Sealos UI 编辑环境变量必须保留此项（UI 全量覆盖会冲掉）**，已写入 DEPLOY.md
- **生产 e2e**（冒烟账号 smoke-1788790991@test.dev）：注册 → 登录 → 加视频 → **10 秒入库 50 条真实评论**，AI 意向分析正常（qualified=5/noise=2/lowIntent=43），日志无 fallback 告警 = TikHub 主数据源直接命中
- TikHub 免费额度消耗累计 ~$0.008，剩 ~$0.042

### 7. VPN 边界确认（✅ 商用运行时必须全程无 VPN，commit `5781da4` 固化到 DEPLOY.md「八」）

- **运行时链路从 Sealos pod 实测全境内直连**：pod → ghcr.io ✅（401 = registry 存活标准响应）、→ api.tikhub.io ✅ ~1-2s、→ douyin ✅ 0.16s、PG/Redis 内网 ✅。**生产运行零 VPN 依赖**
- 仅开发侧 GitHub 受墙影响，三条通道按序：直连 push（波动）→ `api_push.mjs` → VPN 时走仓库级代理 `http.https://github.com.proxy=127.0.0.1:10808`（已写入本仓库 git config，只影响 github.com）
- 经验：**VPN 全局/TUN 模式开启时 Sealos 及国内站反而不通**——推代码开 VPN、操作 Sealos 关 VPN，或 VPN 客户端改规则模式

## 关键经验（排障复用）

- **Sealos 不可达先关 VPN 再排查**；仍不通则浏览器开 Sealos 桌面从 `localStorage.session` 取新 kubeconfig 覆盖 `D:\Backup\Downloads\kubeconfig.yaml`
- **vitest 不自动加载 `.env.test`**：`npm test` 前必须 `export TEST_DATABASE_URL=$(grep '^TEST_DATABASE_URL=' .env.test | cut -d= -f2- | tr -d "\"'")`，否则打未启动的本地 Docker 库报空错误（已写入 DEPLOY.md）
- **Git Bash 的 `curl -d` 发中文按 GBK 编码 → 服务端乱码**（9-1 记录）：冒烟脚本一律用 UTF-8 payload 文件
- 云端爬虫报错「无效响应类型 NoneType」= 抖音 302/400 风控，看 `handle_http_status_error` 的 pass/吞异常逻辑即知

## 下次继续记录

- **TikHub 额度管理**：免费额度剩 ~$0.042，正式商用前到 tikhub.io 充值并关注用量；支付方式（国际卡/支付宝）充值时确认
- **住宅代理（建议做）**：给自建爬虫 fallback 线路用——买静态住宅 IP（¥50-100/月）→ 填 `scraper-cloud/crawlers/douyin/web/config.yaml` 的 `TokenManager.douyin.proxies.http/https` → push 到 `kehuojingling-scraper` 仓库 → Sealos 重启该应用 → 8 连发复测成功率应接近 100%
- **失败告警**：TikHub 失败转 fallback 目前只有 console.warn，商用前接入「队列积压/失败率主动告警」（历史待办）
- **自建爬虫 Cookie**：`config.yaml` 里 2025-03 的抖音 Cookie 已过期，浏览器登录 douyin.com 复制更新（上游注释说只需改这一处）
- **当前分支**：`main`，本地 `eb833dd` + WORK_LOG 未提交改动；远端 `9ab3da3`（API 压缩 commit，tree 已校验一致；github.com 直连恢复后 `git fetch && git reset --hard origin/main` 对齐 sha）
- **本地未跟踪文件**：`scripts/debug/cloud_smoke_t7*.sh`（含一次性冒烟账号密码，不要 commit；api_push.mjs 无硬编码密钥已入库）
- **真实发送验证（商用前必做）**：当前 `SENDER_PROVIDER=mock`。真实抖音 Cookie + Playwright 发送未在云端端到端验证：设置页配真实 Cookie → 切 real → 观察 verifyDmSent/verifyReplyPublished
- **清理项（按需）**：`sender/index.ts` 的 `sendReplyToPlatform`/`sendDmToPlatform` 已无调用方可删；冒烟账号及其数据可清
- **历史待办（仍有效）**：种草 fallback 句式库仅 5 条；队列积压/失败率主动告警；UA 池随 Chrome 版本更新；仓库建议转 private（旧密钥在 git 历史）；Phase 4（Cookie 自动刷新、账号分组、话术 A/B 风控率、抓取-发送联动）

## 开发命令

```bash
# 一键启动 Next.js + 抓取服务（开发；本机不要启 Docker Desktop，会卡死）
cd /e/ai/YJ-HUOKE && npm run dev:all

# 单独启动本地抓取服务（排障用，端口 8000，文档 http://localhost:8000/docs）
cd /e/ai/Douyin_TikTok_Download_API && ./.venv/Scripts/python.exe start.py

# 测试（Neon 云端测试库；必须先 export，vitest 不自动加载 .env.test）
cd /e/ai/YJ-HUOKE && export TEST_DATABASE_URL=$(grep '^TEST_DATABASE_URL=' .env.test | cut -d= -f2- | tr -d "\"'") && npm test

# github.com 被墙时的 API 推送通道（token 运行时取自 git 凭证管理器）
cd /e/ai/YJ-HUOKE && node scripts/debug/api_push.mjs

# Sealos 集群访问（不可达先关 VPN）
export KUBECONFIG="D:/Backup/Downloads/kubeconfig.yaml" && kubectl get pods
```

## 已知问题 / 后续

- 百度指数 / 抖音热点宝当前为占位实现。
- 抖音自动回复 / 私信依赖真实 Cookie 和 Playwright，生产需单独维护。
- ~~发送链路同步直发~~ → 已队列化（T7）并已上线；账号池轮换、日限额、熔断、Bull limiter、北京时间安全窗口均已真正生效。
- ~~安全窗口按服务器本地时区~~ → 已修复为北京时间（082038b）。
- ~~云端爬虫被抖音风控（NoneType 报错）~~ → 已定位为出口 IP 层封禁并闭环：**TikHub 主数据源上线（9-7），自建爬虫降 fallback**；fallback 线路待配住宅代理加固。
- Sealos/国内站在 VPN 全局模式下不可达（链路干扰形态，关 VPN 即恢复）。
