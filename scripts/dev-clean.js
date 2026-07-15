/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync, spawn } = require('child_process');

function killProcessOnPort(port) {
  try {
    // Windows: netstat -ano | findstr :3000
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', shell: 'cmd.exe' });
    const lines = output.trim().split('\n');
    const pids = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) {
        pids.add(pid);
      }
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { shell: 'cmd.exe' });
        console.log(`Killed process ${pid} on port ${port}`);
      } catch {
        // ignore errors
      }
    }
  } catch {
    // no process found on port
  }
}

async function checkPostgres() {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    console.warn(`[dev-clean] PostgreSQL 不可达：${error.message}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkRedis() {
  const Redis = require('ioredis');
  const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch (error) {
    console.warn(`[dev-clean] Redis 不可达：${error.message}`);
    return false;
  } finally {
    client.disconnect();
  }
}

async function main() {
  const port = process.env.PORT || 3000;
  console.log(`Cleaning up port ${port}...`);
  killProcessOnPort(port);

  const dbOk = await checkPostgres().catch(() => false);
  const redisOk = await checkRedis().catch(() => false);

  if (!dbOk || !redisOk) {
    console.warn('[dev-clean] 部分依赖服务未启动，继续启动 Next.js（队列等功能可能不可用）');
    console.warn('[dev-clean] 如需启动完整环境，请先运行：npm run docker:up');
  }

  console.log('Starting Next.js dev server...');
  const child = spawn('next dev', {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
  });

  child.on('exit', (code) => {
    process.exit(code);
  });
}

main();
