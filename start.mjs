// start.mjs —— 一键启动：DSH + 桥 + cloudflared 隧道
// 用法：node start.mjs
// 前置：
//   1. 关掉之前手动起的 dsh web / bridge.js / cloudflared，避免端口冲突。
//   2. 把 cloudflared.exe 放到本脚本同目录（项目根目录）。
//
// 流程：
//   1. 起 DSH（dsh --profile web --no-open），从 stdout 抓 token + host
//   2. 起桥（node bridge.js），从它打印的 "listening on" 里直接取端口（不写死）
//   3. 起 cloudflared 快速隧道（转发桥端口），静默抓互联网 URL（不刷 CF 噪音）
//   4. 汇总打印：token + 局域网地址 + 互联网地址
// 停止：Ctrl+C 同时杀掉三个子进程（含 DSH 的 Electron 孙进程）。
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLOUDFLARED = path.join(__dirname, 'cloudflared.exe');

const children = [];
const track = (c) => {
  children.push(c);
  return c;
};
const killAll = () => {
  for (const c of children) {
    if (!c.pid) continue;
    // 关键：用 taskkill /T /F 杀整棵进程树，而不是 child.kill()。
    // 因为 DSH 是 shell:true 起的（cmd.exe → dsh.cmd → DeepSeek Harness.exe），
    // child.kill() 只杀 cmd.exe 这一层，会留下 Electron 孙进程继续占着 3080。
    try {
      spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      try {
        c.kill();
      } catch {
        /* noop */
      }
    }
  }
};

process.on('SIGINT', () => {
  console.log('\n\n收到 Ctrl+C，正在停止 DSH / 桥 / 隧道…');
  killAll();
  process.exit(0);
});

/**
 * 监听子进程输出流，匹配到正则即 resolve。
 * @param {object} opts quiet=true 时不回显（只在失败时 dump 尾部）；prefix 控制回显前缀。
 */
function watch(child, streamName, regex, label, timeoutMs, { quiet = false, prefix = `[${label}] ` } = {}) {
  return new Promise((resolve, reject) => {
    const stream = child[streamName];
    let buf = '';
    const tail = () => buf.slice(-1200);
    const timer = setTimeout(
      () => reject(new Error(`${label} 超时：${timeoutMs}ms 内没匹配到 ${regex}\n最近输出：\n${tail()}`)),
      timeoutMs,
    );
    stream.on('data', (chunk) => {
      const text = chunk.toString();
      if (!quiet) process.stdout.write(prefix + text);
      buf += text;
      const m = buf.match(regex);
      if (m) {
        clearTimeout(timer);
        resolve({ match: m, buffer: buf });
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`${label} 进程退出 code=${code}，未匹配到\n最近输出：\n${tail()}`));
    });
  });
}

async function main() {
  console.log('=== 一键启动 DSH + 桥 + 隧道 ===\n');

  if (!fs.existsSync(CLOUDFLARED)) {
    console.error(`❌ 找不到 cloudflared.exe：${CLOUDFLARED}`);
    console.error('   请把 cloudflared.exe 复制到本脚本同目录（项目根目录）。');
    process.exit(1);
  }

  // ── 1. DSH：抓 token + host ──
  console.log('[1/3] 启动 DSH（dsh --profile web --no-open）…');
  const dsh = track(
    spawn('dsh --profile web --no-open', {
      shell: true, // .cmd 需要 shell；整串命令传参，避开 DEP0190 警告
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }),
  );
  dsh.stderr.on('data', (c) => process.stdout.write(`[dsh:err] ${c}`));

  let token;
  let host = '192.168.8.219';
  try {
    const { match, buffer } = await watch(dsh, 'stdout', /token=([A-Za-z0-9_-]+)/, 'dsh', 60000);
    token = match[1];
    const hosts = [...buffer.matchAll(/http:\/\/([0-9.]+):/g)].map((m) => m[1]);
    host = hosts.find((h) => h !== '127.0.0.1') || hosts[0] || host;
    console.log(`\n[1/3] ✅ token 抓到（host=${host}）\n`);
  } catch (e) {
    console.error(`\n[1/3] ❌ ${e.message}\n`);
    killAll();
    process.exit(1);
  }

  // ── 2. 桥：从它自己打印的 "listening on" 取端口 ──
  console.log('[2/3] 启动桥（node bridge.js）…');
  const bridge = track(
    spawn('node', [path.join(__dirname, 'bridge.js')], {
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  bridge.stderr.on('data', (c) => process.stdout.write(`[bridge:err] ${c}`));

  let bridgePort;
  try {
    const { match } = await watch(bridge, 'stdout', /listening on http:\/\/0\.0\.0\.0:(\d+)/, 'bridge', 10000, {
      prefix: '', // bridge.js 自带 [bridge] 前缀，这里不再加
    });
    bridgePort = Number(match[1]);
    console.log(`[2/3] ✅ 桥端口：${bridgePort}\n`);
  } catch (e) {
    console.error(`\n[2/3] ❌ ${e.message}\n`);
    killAll();
    process.exit(1);
  }

  // ── 3. 隧道：静默抓 URL（不刷 CF 噪音）──
  console.log('[3/3] 启动 cloudflared 快速隧道（静默等待，通常 3~10 秒）…');
  const cf = track(
    spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${bridgePort}`], {
      stdio: ['ignore', 'ignore', 'pipe'],
    }),
  );

  let tunnelUrl;
  try {
    const { match } = await watch(cf, 'stderr', /https:\/\/[a-z0-9-]+\.trycloudflare\.com/, 'cf', 60000, {
      quiet: true,
    });
    tunnelUrl = match[0];
    console.log(`[3/3] ✅ 隧道 URL：${tunnelUrl}\n`);
  } catch (e) {
    console.error(`\n[3/3] ❌ ${e.message}\n`);
    killAll();
    process.exit(1);
  }

  // ── 4. 汇总 ──
  const lanBridgeUrl = `http://${host}:${bridgePort}`;
  console.log('══════════════════════════════════════════════');
  console.log('  token   :', token);
  console.log('  局域网   :', lanBridgeUrl);
  console.log('  互联网   :', tunnelUrl);
  console.log('══════════════════════════════════════════════');
  console.log('\nApp 里填：');
  console.log('  地址 = 局域网或互联网二选一');
  console.log('  token = 上面这串');
  console.log('\n按 Ctrl+C 全部停止。');
}

main().catch((e) => {
  console.error('启动失败：', e);
  killAll();
  process.exit(1);
});
