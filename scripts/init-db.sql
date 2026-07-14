-- 初始化数据库权限（Docker 已通过 POSTGRES_DB 创建主库，此处保留扩展）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
