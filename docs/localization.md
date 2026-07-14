# 项目数据本地化指南

由于 Docker 容器重启会导致未持久化的数据丢失，本指南将数据库（PostgreSQL）和队列（Redis）迁移到本地 Docker 运行，并通过 Docker Volume 持久化到宿主机。

## 架构变化

| 组件 | 之前 | 本地化后 |
|------|------|----------|
| 数据库 | Render PostgreSQL（云端） | 本地 PostgreSQL 容器 + Volume 持久化 |
| 队列 | 可能未启用或云端 Redis | 本地 Redis 容器 + AOF 持久化 |
| 数据安全 | 依赖云服务商 / 容器内易失 | 数据保存在 Docker Volume，容器重建不丢失 |

## 快速开始

### 1. 启动本地服务

```bash
docker compose up -d
```

这会启动：
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### 2. 配置环境变量

复制示例文件并修改：

```bash
cp .env.example .env
```

`.env` 中数据库和 Redis 使用本地地址（已内置在 `.env.example` 中）：

```env
DATABASE_URL="postgresql://kehuojingling:kehuojingling@localhost:5432/kehuojingling?schema=public"
REDIS_URL="redis://localhost:6379"
```

### 3. 初始化数据库

```bash
npx prisma db push
```

> 首次运行会按 `prisma/schema.prisma` 创建表结构。

### 4. 运行项目

```bash
npm run dev:clean
```

## 从 Render 迁移数据到本地（可选）

如果你之前的数据在 Render PostgreSQL，需要把数据迁回本地：

1. 在 Render Dashboard 获取 **External Database URL**。
2. 导出云端数据：
   ```bash
   pg_dump "RENDER_DATABASE_URL" > backup.sql
   ```
3. 导入到本地数据库：
   ```bash
   psql "postgresql://kehuojingling:kehuojingling@localhost:5432/kehuojingling" < backup.sql
   ```
4. 修改 `.env` 中的 `DATABASE_URL` 指向本地，重启应用。

## 数据持久化说明

- PostgreSQL 数据保存在 Docker 管理的 `kehuojingling_postgres_data` volume。
- Redis 开启 AOF 持久化，数据保存在 `kehuojingling_redis_data` volume。
- 即使执行 `docker compose down` 或重启电脑，数据也会保留。
- 只有在显式删除 volume 时数据才会丢失：
  ```bash
  docker compose down -v
  ```

## 常用命令

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f

# 停止服务
docker compose down

# 完全重置（会删除所有本地数据，慎用）
docker compose down -v

# 进入 PostgreSQL 命令行
docker exec -it kehuojingling-db psql -U kehuojingling -d kehuojingling

# 进入 Redis 命令行
docker exec -it kehuojingling-redis redis-cli
```

## 生产环境

生产环境建议继续使用 Render / 其他托管 PostgreSQL 和 Redis，并在 `.env` 中配置对应连接地址。本地 Docker 方案仅用于开发环境避免数据丢失。
