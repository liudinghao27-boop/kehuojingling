# 设置页「平台账号配置」改造为书签小工具同步 Cookie

## 目标
将设置页 `src/app/dashboard/settings/page.tsx` 的「平台账号配置」板块从扫码登录切换为浏览器书签小工具同步 Cookie。

## 任务拆分
1. 新增 API `GET /api/user/bookmarklet-token`：使用 `getServerSession` 校验登录，返回 `{ token: generateBookmarkletToken(session.user.id) }`。
2. 改造 `src/app/dashboard/settings/page.tsx`：
   - 删除所有 QR 码相关状态、函数、Dialog、轮询 useEffect。
   - 新增书签小工具状态：`bookmarkletToken`、`bookmarkletPlatform`、`showBookmarklet`。
   - 页面加载时调用 `/api/user/bookmarklet-token`，失败提示「请刷新页面重试」。
   - 新增 `generateBookmarkletCode(platform, token)` 函数，生成可拖动的 `javascript:` 书签代码。
   - 平台账号配置卡片：保留平台选择；移除「扫码登录」按钮；新增「使用浏览器书签同步 Cookie」按钮及展开说明区域；保留手动输入 Cookie 折叠区域作为备用。
3. 运行 `npm run build` 验证无 TypeScript 错误。

## 文件变更
- 新增：`src/app/api/user/bookmarklet-token/route.ts`
- 修改：`src/app/dashboard/settings/page.tsx`
