# 获客精灵 — UI/UX 设计系统

## 1. 设计理念

- **简洁高效**：商家用户时间宝贵，界面一目了然
- **数据驱动**：用颜色和数字传达关键信息
- **移动端优先**：很多用户用手机管理
- **信任感**：专业、安全、合规的视觉传达

## 2. 色彩系统

### 主色调
```
Primary:    #3B82F6 (蓝色) — 品牌色、主按钮、链接
Primary-50: #EFF6FF — 背景、hover 状态
Primary-600:#2563EB — 按下状态
```

### 功能色
```
Success:    #22C55E (绿色) — 成功、已发送、高转化
Warning:    #F59E0B (橙色) — 警告、待处理、中意向
Danger:     #EF4444 (红色) — 错误、高意向、紧急
Info:       #3B82F6 (蓝色) — 提示、信息
```

### 意向评分色阶
```
Score 5 (强意向): #DC2626 — 深红，需要立即处理
Score 4 (高意向): #EA580C — 橙红，优先处理
Score 3 (中意向): #D97706 — 橙色，稍后处理
Score 2 (低意向): #3B82F6 — 蓝色，观察
Score 1 (无意向): #6B7280 — 灰色，忽略
```

### 中性色
```
Gray-50:  #F9FAFB — 页面背景
Gray-100: #F3F4F6 — 卡片背景
Gray-200: #E5E7EB — 边框、分割线
Gray-300: #D1D5DB — 禁用状态
Gray-400: #9CA3AF — 次要文字
Gray-500: #6B7280 — 辅助文字
Gray-600: #4B5563 — 正文
Gray-700: #374151 — 标题
Gray-800: #1F2937 — 深色标题
Gray-900: #111827 — 最深色
```

## 3. 字体系统

```
Font Family: Inter, system-ui, -apple-system, sans-serif

H1:  24px / 32px, font-weight: 700 — 页面标题
H2:  20px / 28px, font-weight: 600 — 区块标题
H3:  18px / 26px, font-weight: 600 — 卡片标题
H4:  16px / 24px, font-weight: 600 — 小标题
Body: 14px / 22px, font-weight: 400 — 正文
Small: 12px / 18px, font-weight: 400 — 辅助文字
Caption: 11px / 16px, font-weight: 500 — 标签、徽章
```

## 4. 间距系统

```
xs:  4px  — 图标内边距、紧凑间距
sm:  8px  — 组件内部间距
md:  16px — 卡片内边距、表单间距
lg:  24px — 区块间距
xl:  32px — 页面间距
2xl: 48px — 大区块间距
```

## 5. 圆角系统

```
sm:  4px  — 按钮、输入框
md:  8px  — 卡片、弹窗
lg:  12px — 大卡片、模态框
xl:  16px — 特殊卡片
full: 9999px — 头像、徽章、胶囊按钮
```

## 6. 阴影系统

```
sm:  0 1px 2px rgba(0,0,0,0.05) — 按钮、输入框
md:  0 4px 6px rgba(0,0,0,0.1)  — 卡片 hover
lg:  0 10px 15px rgba(0,0,0,0.1) — 弹窗、下拉菜单
xl:  0 20px 25px rgba(0,0,0,0.15) — 模态框
```

## 7. 组件规范

### 按钮

```
Primary:   bg-blue-500, text-white, hover:bg-blue-600, rounded-md, px-4 py-2
Secondary: bg-white, text-gray-700, border border-gray-300, hover:bg-gray-50
Danger:    bg-red-500, text-white, hover:bg-red-600
Ghost:     bg-transparent, text-gray-600, hover:bg-gray-100
Link:      bg-transparent, text-blue-500, hover:underline

Size:
  sm: px-3 py-1.5, text-sm
  md: px-4 py-2, text-sm
  lg: px-6 py-3, text-base
```

### 卡片

```
Card: bg-white, rounded-lg, shadow-sm, p-6
Card Hover: shadow-md, transition-shadow
Card Header: flex justify-between items-center, mb-4
Card Title: text-lg font-semibold text-gray-900
Card Body: text-gray-600
```

### 输入框

```
Input: w-full, rounded-md, border border-gray-300, px-3 py-2
Focus: border-blue-500, ring-1 ring-blue-500
Error: border-red-500, ring-1 ring-red-500
Disabled: bg-gray-100, text-gray-400
```

### 徽章

```
Badge: inline-flex, items-center, rounded-full, px-2.5 py-0.5, text-xs font-medium
Success: bg-green-100, text-green-800
Warning: bg-yellow-100, text-yellow-800
Danger:  bg-red-100, text-red-800
Info:    bg-blue-100, text-blue-800
```

### 表格

```
Table: min-w-full, divide-y divide-gray-200
Header: bg-gray-50, px-6 py-3, text-left, text-xs font-medium text-gray-500 uppercase
Row: bg-white, hover:bg-gray-50
Cell: px-6 py-4, whitespace-nowrap, text-sm text-gray-900
```

## 8. 布局规范

### 导航栏
```
Height: 64px
Background: bg-white, border-b border-gray-200
Content: max-w-7xl mx-auto, px-4 sm:px-6 lg:px-8
Left: Logo + 导航链接
Right: 用户头像 + 套餐信息 + 升级按钮
```

### 侧边栏（仪表盘）
```
Width: 240px (desktop), 100% (mobile)
Background: bg-gray-900, text-white
Item: px-4 py-3, hover:bg-gray-800, rounded-md
Active: bg-blue-600, text-white
Icon: 20px, mr-3
```

### 内容区
```
Max Width: 1280px (max-w-7xl)
Padding: px-4 sm:px-6 lg:px-8
Margin: mx-auto
```

## 9. 响应式断点

```
sm: 640px  — 手机横屏
md: 768px  — 平板
lg: 1024px — 小桌面
xl: 1280px — 标准桌面
2xl: 1536px — 大桌面
```

### 移动端适配规则
- 导航栏 → 汉堡菜单
- 侧边栏 → 底部 Tab 栏
- 表格 → 卡片列表
- 多列布局 → 单列堆叠
- 弹窗 → 底部 Sheet

## 10. 动画规范

```
Transition: transition-all duration-200 ease-in-out
Hover: transform scale(1.02) or shadow-md
Modal: fade-in + scale-in, 200ms
Toast: slide-in from right, 300ms
Loading: spin, 1s linear infinite
Skeleton: pulse, 2s cubic-bezier(0.4, 0, 0.6, 1) infinite
```

## 11. 图标规范

```
Size:
  sm: 16px — 按钮内、列表项
  md: 20px — 导航、表单
  lg: 24px — 空状态、大按钮
  xl: 32px — 特色功能图标

Style: Lucide icons (outline style)
Color: inherit from parent text color
```

## 12. 空状态规范

```
Icon: xl size, text-gray-300
Title: text-lg font-medium text-gray-900, mt-4
Description: text-sm text-gray-500, mt-2
Action: Primary button, mt-6
```

## 13. 加载状态规范

```
Button Loading: Spinner + "处理中..."
Page Loading: Skeleton screens
Data Loading: Spinner in content area
Table Loading: Skeleton rows
Card Loading: Skeleton card
```

## 14. 设计原则 Checklist

- [ ] 每个页面有明确的主行动按钮（CTA）
- [ ] 关键数据用颜色和数字突出
- [ ] 操作反馈即时（Toast、动画）
- [ ] 错误状态友好（不显示技术错误）
- [ ] 表单有清晰的标签和验证提示
- [ ] 移动端所有功能可用
- [ ] 深色模式支持（可选）
- [ ] 无障碍：足够的对比度、键盘导航、屏幕阅读器
