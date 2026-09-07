# 2026-09-07 TikHub 数据源适配层

## 背景

云端自建爬虫（Evil0ctal）被抖音对 Sealos 机房出口 IP 间歇性软封禁（实测单请求成功率 ~62%）。按当日商业化决策：**TikHub 作主数据源，自建爬虫降 fallback**。TikHub 免费额度实测通过（3/3，数据结构与自建爬虫逐字段一致）。

## 改动范围

1. `src/lib/scraper/douyin.ts`
   - 新增 `TIKHUB_API_KEY` 环境变量读取（未配置则完全走旧路径，行为不变）
   - DOUYIN 评论抓取新流程：
     - aweme_id 解析：`/video/<数字id>` 直取（跳过 hybrid）→ 短链本地 follow 302 提取 → 自建 hybrid 兜底
     - 评论拉取：TikHub 主调（`https://api.tikhub.io/api/v1/douyin/web/fetch_video_comments`，Bearer 认证，校验 HTTP 200 + body `code===200`）→ 失败 fallback 自建 `fetch_video_comments`
     - 仅配 TikHub、不配 SCRAPER_API_URL 也能工作（`apiEndpoint` 改可选、惰性求值）
   - 评论字段映射抽取为共用函数（TikHub/自建两路径 DRY）
   - 快手/视频号路径不变
2. `src/lib/scraper/douyin.test.ts`：先写红测（TikHub 主调/短链解析/fallback/无 key 兼容）
3. `ENV_CONFIG.md` + `.env.example`：补 `TIKHUB_API_KEY` 说明
4. `.env`（gitignored）：写入真实 key 供本地联调

## 验证

- `npx vitest run src/lib/scraper/` 全绿
- `npx tsc --noEmit` + `npm run lint` 通过
- 真实 key 少量调用端到端验证（免费额度还剩 ~45 次）
