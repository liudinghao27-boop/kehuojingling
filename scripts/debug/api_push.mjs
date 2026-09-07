#!/usr/bin/env node
// Push local HEAD to GitHub via REST Git Data API (bypasses blocked github.com git endpoints).
import { execSync } from 'node:child_process';

const REPO = 'liudinghao27-boop/kehuojingling';
const API = `https://api.github.com/repos/${REPO}`;
const CWD = 'E:/ai/YJ-HUOKE';

const run = (cmd) => execSync(cmd, { cwd: CWD, encoding: 'utf8' }).trim();

// token from git credential manager (never printed)
const credOut = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const TOKEN = credOut.split('\n').find(l => l.startsWith('password=')).slice('password='.length).trim();

async function gh(method, path, data) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'git-api-push',
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${method} ${path}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  return res.json();
}

const localSha = run('git rev-parse HEAD');
const { object: { sha: remoteSha } } = await gh('GET', '/git/ref/heads/main');
console.log(`local  HEAD: ${localSha}`);
console.log(`remote main: ${remoteSha}`);

if (remoteSha === localSha) { console.log('already up to date'); process.exit(0); }

// fast-forward only: remote sha 在本地存在时用 merge-base 判定；
// 不存在（上次由本脚本经 API 创建）时，沿本地祖先链比较 tree，
// 找到 tree 与远端一致的本地祖先说明内容同源（API commit 与本地 commit 仅元数据差异），视为可快进。
let ff = true;
let diffBase = remoteSha;
try {
  execSync(`git merge-base --is-ancestor ${remoteSha} ${localSha}`, { cwd: CWD });
} catch {
  let remoteTree;
  try {
    remoteTree = (await gh('GET', `/git/commits/${remoteSha}`)).tree.sha;
  } catch {
    remoteTree = null;
  }
  let matched = false;
  if (remoteTree) {
    for (let i = 1; i <= 20; i++) {
      let ancestorTree;
      try {
        ancestorTree = run(`git rev-parse "HEAD~${i}^{tree}"`);
      } catch {
        break; // 本地历史到头
      }
      if (ancestorTree === remoteTree) {
        matched = true;
        console.log(`remote commit unknown locally, but remote tree == local HEAD~${i} tree → treat as fast-forward`);
        // 远端 commit 本地不存在，但 tree 一定在（内容同源自本地推上去）——以远端 tree 为 diff 基准
        diffBase = remoteTree;
        break;
      }
    }
  }
  if (!matched) {
    ff = false;
  }
}
if (!ff) {
  console.error('remote has diverged; refusing non-fast-forward API push');
  process.exit(1);
}

const statusLines = run(`git diff --name-status ${diffBase} ${localSha}`).split('\n').filter(Boolean);
const treeItems = [];
for (const line of statusLines) {
  const [status, path] = line.split('\t');
  if (status.startsWith('D')) {
    treeItems.push({ path, mode: '100644', type: 'blob', sha: null });
    console.log(`  del ${path}`);
    continue;
  }
  const raw = execSync(`git show ${localSha}:"${path}"`, { cwd: CWD });
  const blob = await gh('POST', '/git/blobs', { content: raw.toString('base64'), encoding: 'base64' });
  treeItems.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  console.log(`  add ${path}`);
}

const message = run('git log -1 --format=%B');
const tree = await gh('POST', '/git/trees', { base_tree: remoteSha, tree: treeItems });
const author = { name: 'liudinghao27', email: 'liudinghao27-boop@users.noreply.github.com' };
const commit = await gh('POST', '/git/commits', {
  message, tree: tree.sha, parents: [remoteSha], author, committer: author,
});
await gh('PATCH', '/git/refs/heads/main', { sha: commit.sha, force: false });
console.log(`OK: remote main -> ${commit.sha}`);
console.log('note: tree was built from local blobs with base_tree=remote; verify on GitHub if in doubt');
