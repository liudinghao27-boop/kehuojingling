# Phase 7 Step 4：抖音 Playwright Provider 实现计划

## 目标
在 `E:/ai/YJ-HUOKE` 中完成抖音真实发送 Provider，使评论回复与私信可基于 Playwright 模拟浏览器操作。

## 变更清单

1. **安装依赖**
   - `npm install playwright`
   - 在 `next.config.ts` 的 `serverExternalPackages` 中加入 `'playwright'`，避免 Next.js 打包原生依赖。

2. **新增 `src/lib/sender/providers/douyin.ts`**
   - 实现 `SenderProvider` 接口。
   - 提供 Cookie 解析：支持 JSON 数组、JSON 对象、`key=value; ...` 字符串。
   - 提供浏览器启动与关闭的 `withBrowser` 帮助函数，保证 `try/finally` 关闭。
   - `validateCredentials`：设置 Cookie 后访问抖音首页，通过页面元素判断登录状态。
   - `sendReply`：访问视频页，查找目标评论（按作者名），点击「回复」→输入内容→发送。
   - `sendDm`：访问视频页，点击评论作者进入主页，点击「私信」→输入内容→发送。
   - 关键步骤间加入 `randomDelay(1000, 3000)` 模拟真人操作。
   - 默认超时 30 秒，所有操作使用 `page.locator()` / `text=` 选择器，并标注抖音 UI 可能变化。

3. **更新 `src/lib/sender/providers/index.ts`**
   - 导入 `douyinProvider`，导出类型为 `Record<string, SenderProvider>` 的 `providers`。

4. **更新 `src/lib/sender/config.ts`**
   - `getActiveProvider(platform)`：当 `platform === 'DOUYIN'` 时返回 `providers.douyin`，否则 `providers.mock`。
   - `hasProvider(platform)`：保持返回 `true`。

5. **构建验证**
   - 运行 `npm run build`，确认无 TypeScript / 打包错误。

## 验证命令
```bash
cd /e/ai/YJ-HUOKE && npm run build
```
