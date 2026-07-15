# 抖音真实发送 Provider 第一阶段升级计划

## 目标
完成并稳定 Douyin real-sender Provider，补充单元测试，清理调试产物，更新工作日志。

## 任务清单

1. 重构 `src/lib/sender/providers/douyin.ts`
   - 导出 `parseCookies` / `getCookies` 等纯函数，便于测试。
   - 将 debug 截图/可见浏览器功能改为通过环境变量显式开启：`SENDER_DEBUG=1`、`SENDER_HEADLESS=false`。
   - 抽离浏览器共享上下文生命周期，命名为 `launchContext` / `getSharedContext` / `withBrowser`，并添加 `SIGINT` / `exit` 清理逻辑。
   - 保持 `SenderProvider` 公共接口不变，保留真实浏览器自动化逻辑。
   - 对常见失败场景给出明确错误信息：缺少 Cookie、登录过期、元素未找到、风控验证等。

2. 新增 `src/lib/sender/providers/douyin.test.ts`
   - `parseCookies`：JSON 数组、JSON 对象、`key=value; ...` 字符串三种格式。
   - `getCookies`：优先使用 params.credentials.cookies，回退到 `DOUYIN_COOKIES`。
   - 使用 `vi.mock('playwright')` 模拟浏览器。
   - `validateCredentials`：有效/无效 Cookie。
   - `sendReply` / `sendDm`：正常路径与元素未找到失败路径。

3. 清理调试产物
   - `.gitignore` 增加 `logs/` 目录。
   - 将 `scripts/test-douyin-*.ts` 和 `scripts/update-douyin-cookies*.ts` 移动到 `scripts/debug/`，并创建 `scripts/debug/README.md`。

4. 更新 `WORK_LOG.md`
   - 添加 2026-07-15 当天记录：Douyin sender 重构、测试、调试脚本整理、验证命令。
   - 更新已知问题/下一步：下一阶段重点为 keyword-monitor 桥接。

5. 验证
   - `npm test`：原有 61 个 + 新增测试全部通过。
   - `npm run lint` 通过。
   - `npx tsc --noEmit` 通过。
   - `npm run build` 通过。

## 风险与回退
- 仅重构实现与新增测试，不修改 API 路由与公共接口。
- 调试脚本移动后，原路径不再存在，引用者需改到 `scripts/debug/`。
