/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRAPER_PATH = process.env.SCRAPER_PATH || 'E:/ai/Douyin_TikTok_Download_API';
const IS_WINDOWS = process.platform === 'win32';

function log(message) {
  console.log(`[scraper] ${message}`);
}

function error(message) {
  console.error(`[scraper] ${message}`);
}

function main() {
  if (!fs.existsSync(SCRAPER_PATH)) {
    error(`抓取服务目录不存在：${SCRAPER_PATH}`);
    error('可通过环境变量 SCRAPER_PATH 指定路径');
    process.exit(1);
  }

  const venvDir = path.join(SCRAPER_PATH, '.venv');
  if (!fs.existsSync(venvDir)) {
    error(`未找到 Python 虚拟环境：${venvDir}`);
    error('请先进入抓取服务目录并创建 .venv 虚拟环境');
    process.exit(1);
  }

  const pythonExe = IS_WINDOWS
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');

  if (!fs.existsSync(pythonExe)) {
    error(`未找到 Python 解释器：${pythonExe}`);
    process.exit(1);
  }

  const startScript = path.join(SCRAPER_PATH, 'start.py');
  if (!fs.existsSync(startScript)) {
    error(`未找到启动脚本：${startScript}`);
    process.exit(1);
  }

  log(`启动抓取服务：${SCRAPER_PATH}`);
  log(`Python：${pythonExe}`);

  const child = spawn(pythonExe, ['start.py'], {
    cwd: SCRAPER_PATH,
    stdio: 'pipe',
    shell: false,
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(`[scraper] ${data.toString()}`);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(`[scraper] ${data.toString()}`);
  });

  child.on('error', (err) => {
    error(`启动失败：${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      error(`抓取服务退出，退出码 ${code}`);
      error(`可查看日志：${path.join(SCRAPER_PATH, 'logs')}`);
    }
    process.exit(code ?? 0);
  });

  function shutdown(signal) {
    log(`收到 ${signal}，正在停止抓取服务...`);
    if (IS_WINDOWS) {
      try {
        // Windows 下子进程通常收不到 POSIX 信号，使用 taskkill 强制树级终止
        const { spawn } = require('child_process');
        spawn('taskkill', ['/pid', child.pid, '/T', '/F'], { stdio: 'ignore' });
      } catch {
        child.kill('SIGTERM');
      }
    } else {
      child.kill(signal);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Windows 下按 Ctrl+C 时 process.on('SIGINT') 可能不触发，监听 readline 兜底
  if (IS_WINDOWS) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.on('SIGINT', () => shutdown('SIGINT'));
  }
}

main();
