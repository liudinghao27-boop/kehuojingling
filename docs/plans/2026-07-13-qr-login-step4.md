# 二维码登录 Step 4 实施计划

## 目标
在 `src/app/dashboard/settings/page.tsx` 的设置页中完成二维码登录入口与 Dialog，改造「平台账号配置」卡片。

## 文件变更
- `src/app/dashboard/settings/page.tsx`

## 具体改动
1. 新增 Dialog 相关组件 import。
2. 新增二维码登录状态：`qrDialogOpen`、`qrPlatform`、`qrSessionId`、`qrCodeDataUrl`、`qrStatus`、`qrLoading`、`qrError`、`showCookieInput`。
3. 新增函数：
   - `openQrDialog(platform)`：打开 Dialog、重置状态、获取二维码。
   - `closeQrDialog()`：关闭 Dialog、清理轮询状态。
   - `fetchQrCode(platform)`：POST `/api/user/platform-credentials/:platform/qr-login`。
   - `pollQrStatus(platform, sessionId)`：GET 轮询 status API。
4. 新增 `useEffect` 管理轮询定时器，Dialog 关闭或状态为 success/expired/error 时清理。
5. 改造「平台账号配置」卡片 UI：
   - 平台选择下方新增「扫码登录」主按钮。
   - Cookie 输入框默认折叠，新增「手动输入 Cookie（高级）」链接展开。
   - 已保存凭证列表显示「扫码登录」标签（本期统一显示）。
6. 新增扫码登录 Dialog：
   - 标题根据平台动态显示（抖音/快手/视频号扫码登录）。
   - 加载、二维码、状态提示、底部按钮。
   - 二维码图片 `w-56 h-56` 居中。

## 验证
- `npm run build` 无 TypeScript 错误。
