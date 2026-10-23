// bridge.js —— DSH 反向代理 + token→cookie 桥
// 用法：node bridge.js
//
// 作用：App 只连这一条隧道（桥隧道），桥在本机把请求转发给 DSH，并把 Host 改回白名单里的
//       192.168.8.219:3080，从而绕过 DSH 的 Host/Origin 防火墙（403 forbidden）。
//   - GET  /auth?token=xxx        → 换 cookie（桥直连 DSH，Host 用白名单地址）
//   - 其余 /api/*（HTTP）         → 透明转发给 DSH（Host 改写，Cookie 原样透传）
//   - /api/remote.mux（WebSocket）→ 透明转发 WebSocket 到 DSH
const http = require('http');
const net = require('net');

const DSH_HOST = '192.168.8.219';
const DSH_PORT = 3080;
const DSH_AUTHORITY = `${DSH_HOST}:${DSH_PORT}`;
const PORT = 3081;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');

  // 1. auth：换 cookie
  if (u.pathname === '/auth' && u.searchParams.has('token')) {
    const token = u.searchParams.get('token');
    const dsh = http.get(
      {
        hostname: DSH_HOST,
        port: DSH_PORT,
        path: `/?token=${encodeURIComponent(token)}`,
        headers: { Host: DSH_AUTHORITY },
      },
      (r) => {
        const sc = r.headers['set-cookie'];
        if (sc) {
          const cookie = String(Array.isArray(sc) ? sc[0] : sc).split(';')[0];
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, cookie }));
        } else {
          res.writeHead(r.statusCode || 500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, status: r.statusCode || 500 }));
        }
        r.resume();
      },
    );
    dsh.on('error', (e) => {
      console.log('[bridge] auth DSH 连接失败:', e && e.message);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, status: 502 }));
    });
    return;
  }

  // 2. API 转发（HTTP）
  if (u.pathname.startsWith('/api/')) {
    const fwdHeaders = { ...req.headers, Host: DSH_AUTHORITY };
    for (const h of ['origin', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'referer']) {
      delete fwdHeaders[h];
    }
    const proxyReq = http.request(
      {
        hostname: DSH_HOST,
        port: DSH_PORT,
        path: req.url,
        method: req.method,
        headers: fwdHeaders,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', (e) => {
      console.log('[bridge] api DSH 连接失败:', e && e.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('bad gateway');
    });
    req.pipe(proxyReq);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

// 3. WebSocket 转发（透明字节管道）
server.on('upgrade', (req, socket, head) => {
  console.log('[bridge] ws upgrade:', req.url, '| cookie:', req.headers.cookie ? '有' : '无');
  const target = net.connect(DSH_PORT, DSH_HOST, () => {
    console.log('[bridge] ws target 已连接');
    let reqStr = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(req.headers)) {
      const kl = k.toLowerCase();
      if (kl === 'host') reqStr += `Host: ${DSH_AUTHORITY}\r\n`;
      else if (['origin', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'referer'].includes(kl)) continue;
      else reqStr += `${k}: ${v}\r\n`;
    }
    reqStr += '\r\n';
    target.write(reqStr);
    if (head && head.length) target.write(head);
    target.once('data', (chunk) => {
      console.log('[bridge] ws DSH 响应:', chunk.toString().slice(0, 200));
    });
    socket.pipe(target);
    target.pipe(socket);
  });
  target.on('error', (e) => {
    console.log('[bridge] ws DSH 连接失败:', e && e.message);
    socket.destroy();
  });
  target.on('close', () => {
    console.log('[bridge] ws target 关闭');
  });
  socket.on('error', (e) => {
    console.log('[bridge] ws client 错误:', e && e.message);
    target.destroy();
  });
  socket.on('close', () => {
    console.log('[bridge] ws client 关闭');
    target.destroy();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[bridge] listening on http://0.0.0.0:${PORT}`);
  console.log(`[bridge] proxying to http://${DSH_AUTHORITY}`);
});
