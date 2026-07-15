# scripts/debug

本目录存放抖音真实发送器（Douyin real-sender）的本地调试脚本，**不属于 CI/自动化测试的一部分**。

这些脚本用于：
- 在本地浏览器中观察抖音网页版 DOM 结构；
- 手动验证 Cookie 是否有效；
- 调试评论回复/私信发送的真实流程；
- 将本地 Cookie 文件更新到开发数据库。

## 使用前提

1. 安装项目依赖：`npm install`
2. 已下载 Playwright 浏览器：`npx playwright install chromium`
3. 本地存在 `logs/douyin-sender/test-cookies.json`（通过可见浏览器模式登录后导出）
4. 设置必要的环境变量（参考 `.env.example`）

## 脚本说明

| 脚本 | 用途 |
|------|------|
| `test-douyin-reply-debug.ts` | 调试回复按钮与输入框 DOM |
| `test-douyin-reply-e2e.ts` | 调用真实 `douyinProvider` 发送一条回复 |
| `test-douyin-reply-popup.ts` | 验证登录弹窗关闭与评论区加载 |
| `test-douyin-scroll-debug.ts` | 调试抖音页面滚动与可滚动容器 |
| `update-douyin-cookies.ts` | 将 Cookie 文件更新到数据库（Prisma） |
| `update-douyin-cookies-sql.ts` | 将 Cookie 文件更新到数据库（pg 直连） |

## 运行方式

```bash
npx tsx scripts/debug/test-douyin-reply-e2e.ts
```

## 注意事项

- 这些脚本会操作真实抖音页面，可能触发风控或验证码；
- 生产环境不会执行这些脚本；
- 调试过程中产生的截图、浏览器资料保存在 `logs/douyin-sender/`，该目录已被 `.gitignore` 忽略。
