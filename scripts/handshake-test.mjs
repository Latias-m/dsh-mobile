// scripts/handshake-test.mjs
// 用 Node 内置 http 验证 DSH 握手：token → cookie → /api
// 用法：node scripts/handshake-test.mjs <token>
// token 在 DSH 启动终端里，形如 http://192.168.x.x:3080/?token=t-xxxx

import http from 'http'

const BASE = process.env.DSH_BASE || 'http://192.168.8.219:3080'
const TOKEN = process.argv[2]

if (!TOKEN) {
  console.error('❌ 缺少 token')
  console.error('用法: node scripts/handshake-test.mjs <token>')
  console.error('token 在 DSH 启动终端打印的 URL 里')
  process.exit(1)
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

console.log('=== DSH 握手调试 ===')
console.log('BASE :', BASE)
console.log('TOKEN:', TOKEN.slice(0, 12) + '...')
console.log('')

// 1. 握手：GET /?token=xxx（不跟随 303，手动读 Set-Cookie）
console.log('--- 第 1 步：token 交换 ---')
let auth
try {
  auth = await request(`${BASE}/?token=${TOKEN}`, { method: 'GET' })
} catch (e) {
  console.error('❌ 连不上 DSH，请确认 DSH 已启动、IP 正确、能 ping 通')
  console.error(e.message)
  process.exit(1)
}
console.log('状态码   :', auth.status, auth.status === 303 ? '(期望 303) ✅' : '(期望 303，实际不是) ⚠️')
console.log('Set-Cookie:', auth.headers['set-cookie'])

const setCookie = auth.headers['set-cookie']
if (!setCookie) {
  console.error('')
  console.error('❌ 没拿到 Set-Cookie，握手失败。可能原因：')
  console.error('   1. token 已失效（DSH 重启过，token 每次启动都会变）')
  console.error('   2. token 已用过一次（launch token 一次性）')
  process.exit(1)
}

const cookie = setCookie[0].split(';')[0]
console.log('cookie 值 :', cookie)
console.log('')

// 2. 用 cookie 调 /api/session/list
console.log('--- 第 2 步：带 cookie 调 /api ---')
const body = JSON.stringify({
  type: 'client-request',
  rpcId: '1',
  method: 'session/list',
  payload: { args: { _request: {} } },
})
const api = await request(`${BASE}/api/session/list`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'Content-Length': Buffer.byteLength(body),
  },
  body,
})
console.log('状态码:', api.status)
console.log('响应  :', api.body)

// 3. 判断结果
try {
  const data = JSON.parse(api.body)
  if (data.result && data.result.ok) {
    const items = data.result.value?.items ?? []
    console.log('')
    console.log(`✅ 握手成功！拿到 ${items.length} 个会话`)
  } else {
    console.log('')
    console.log('⚠️ 握手 cookie 拿到了，但 /api 返回非 ok，看上面响应')
  }
} catch {
  console.log('⚠️ /api 响应不是 JSON，看上面原始内容')
}
