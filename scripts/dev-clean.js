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

const port = process.env.PORT || 3000;
console.log(`Cleaning up port ${port}...`);
killProcessOnPort(port);

console.log('Starting Next.js dev server...');
const child = spawn('next dev', {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
});

child.on('exit', (code) => {
  process.exit(code);
});
