# DSH 移动端

用 uni-app 写的手机客户端，远程控制跑在电脑上的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）智能体。支持 **H5** 和 **Android App** 双端。

> 手机 App → 反向代理桥 → DSH 桌面智能体。同一局域网直连，公网走 cloudflared 隧道。

---

## 功能

- ✅ **会话管理**：会话列表、新建会话、切换人设（agentPreset）
- ✅ **流式打字机聊天**：AI 回复逐字流式渲染，Markdown 渲染（代码块 / 表格 / 引用样式）
- ✅ **模型 + 思考等级切换**：右侧菜单随时切换 provider / model / reasoningEffort
- ✅ **远程控制 agent**：agent 在电脑上执行工具、读写文件、跑命令，手机实时远程指挥
- 🚧 **审批功能**：agent 要执行敏感工具时，手机弹审批卡片（设计见 [`docs/审批功能设计.md`](docs/审批功能设计.md)）

## 架构

```
┌──────────┐   HTTP / WebSocket    ┌─────────────────────┐   HTTP / WS    ┌──────────────────┐
│  手机 App  │ ───────────────────▶ │  bridge.js (3081)    │ ─────────────▶ │  DSH (3080)      │
│ H5/Android│   局域网直连 / 隧道     │  反向代理 + 换 cookie │                 │  Web 服务 + 智能体 │
└──────────┘                        └─────────────────────┘                 └──────────────────┘
```

- **DSH** 有 Host/Origin 白名单，不信任的来源会 403；token 换 cookie、跨站头剥离都交给 **bridge.js** 做。
- 手机永远只连桥：**局域网**直连 `http://<电脑IP>:3081`，**公网**走 cloudflared 隧道 `https://xxx.trycloudflare.com`。
- 一键启动三个进程：`node start.mjs`（起 DSH + 桥 + 隧道，自动抓 token 和隧道 URL）。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | uni-app（Vue 3 + TypeScript） |
| 状态管理 | Pinia |
| 富文本 | markdown-it + mp-html |
| 组件库 | uni-ui（uni-data-select） |
| 反向代理桥 | Node.js `http` 模块（零依赖） |
| 公网隧道 | cloudflared quick tunnel |

## 快速开始

### 1. 启动服务（电脑上）

```bash
# 一键启动 DSH + 桥 + 隧道（会自动打印 token + 局域网/公网地址）
node start.mjs
```

前置：`cloudflared.exe` 放在项目根目录；`dsh` 已安装并在 PATH。

### 2. 运行 H5（开发）

```bash
pnpm install
npm run dev:h5
```

### 3. 打包 Android APK

用 HBuilderX 打开项目 → 发行 → 原生 App-云打包（或本地打包）。

### 4. 连接

App 里填 **服务器地址**（局域网 `http://电脑IP:3081` 或隧道 `https://xxx.trycloudflare.com`）+ **token**，点连接。

## 目录结构

```
src/
├── api/            # 连接抽象、RPC 封装、WebSocket、类型、事件流转气泡
│   ├── connect/    #   BaseConnect 抽象 + App 端 / H5 端两实现
│   ├── client.ts   #   RPC 方法封装（session/list、prompt、selectModel…）
│   ├── rpc.ts      #   RPC 请求信封构建
│   ├── ws.ts       #   WebSocket mux 流式订阅
│   └── history.ts  #   事件流 → 聊天气泡
├── components/     # 侧边菜单、Markdown 渲染
├── composables/    # useModelPicker（模型选择复用逻辑）
├── pages/          # 主页、连接、会话、新建会话
├── store/          # Pinia 全局状态
└── constants/      # 存储 key、RPC 方法名、默认地址
bridge.js           # 反向代理桥（改 Host + 剥跨站头 + 换 cookie）
start.mjs           # 一键启动 DSH + 桥 + 隧道
```

## 难点与亮点

1. **App 端拿不到 cookie**：plus.net 自动跟随 303 丢失 Set-Cookie → 用 Node 桥（不跟随重定向）代抓 cookie。
2. **App 原生 WebSocket 被 DSH 403**：原生 WS 自带 origin/sec-fetch 跨站头，App 无法控制 → 桥剥掉这些头再转发。
3. **双端接线差异**：H5 走同源代理（浏览器自动管 cookie），App 直连桥（手动带 Cookie + 写系统 CookieManager）。
4. **流式渲染**：mux 协议上 assistant-stream 的 start/chunk/end 帧逐段渲染，空行切块避免整段重渲染闪烁。

详见 [`docs/联调记录.md`](docs/联调记录.md)。

## 文档

- [`docs/联调记录.md`](docs/联调记录.md) —— 完整联调排查过程（每一坑怎么定位）
- [`docs/代码讲解.md`](docs/代码讲解.md) —— 项目代码逐段讲解（uniapp + 接口 + WebSocket）
- [`docs/审批功能设计.md`](docs/审批功能设计.md) —— 审批功能设计方案（待实现）

## 许可证

MIT
