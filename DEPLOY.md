# 获客精灵 - Render 部署指南

## 一键部署步骤

### 1. 注册 Render
- 打开 https://dashboard.render.com
- 点击 **Sign Up** → 选择 **GitHub** 登录
- 授权访问你的仓库

### 2. 创建 PostgreSQL 数据库
- 在 Dashboard 点击 **New** → **PostgreSQL**
- 名称填：`kehuojingling-db`
- 计划选：**Free**
- 点击 **Create Database**
- 等待创建完成，复制 **Internal Database URL**

### 3. 部署 Web Service
- 点击 **New** → **Web Service**
- 选择你的 GitHub 仓库：`liudinghao27-boop/kehuojingling`
- 配置：
  - **Name**: `kehuojingling`
  - **Runtime**: `Node`
  - **Build Command**: `npm install && npx prisma generate && npm run build`
  - **Start Command**: `npx next start`
- 环境变量：
  - `DATABASE_URL` = 刚才复制的数据库 URL
  - `NEXTAUTH_SECRET` = 任意随机字符串（如 `kehuojingling-2024-secret`）
  - `NEXTAUTH_URL` = `https://kehuojingling.onrender.com`（部署后自动更新）
  - `OPENAI_API_KEY` = （可选，没有则使用本地规则分析）
- 点击 **Create Web Service**

### 4. 数据库迁移
部署完成后，在 Render 的 **Shell** 标签页执行：
```bash
npx prisma migrate deploy
```

### 5. 访问应用
- 等待部署完成（约3-5分钟）
- 点击生成的 URL 访问

## 免费限制
- Web Service：每月 750 小时运行时间（足够用）
- PostgreSQL：免费版 1GB 存储
- 15 分钟无访问自动休眠，首次访问需唤醒（约 30 秒）

## 注意事项
- 免费数据库 90 天未使用会被删除，定期访问即可
- 如果需要持续运行，可以设置 UptimeRobot 每 5 分钟 ping 一次
