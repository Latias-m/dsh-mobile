# 读懂 `start.mjs`：从零开始讲一个 Node.js 一键启动脚本

> 面向对象：刚接触 Node.js 的初学者。
> 目标：看完这篇文档，你能**逐行**读懂 `start.mjs` 在做什么、为什么这么写。

这个脚本是一个「一键启动器」，它一口气拉起三个程序：

1. **DSH** —— 一个远程 Web 服务（本身是个 Electron 应用）；
2. **桥（bridge.js）** —— 一个 Node.js 反向代理；
3. **cloudflared** —— 快速隧道，把一个本地端口暴露到公网。

然后它自动从这三个程序的输出里「抓」出 `token` 和隧道 `URL`，最后汇总打印，方便你在手机 App 里填写连接信息。

我们先不急着看整体流程，而是从最基础的概念开始，一层一层往上爬。

---

## 目录

1. [什么是 `.mjs` 文件](#1-什么是-mjs-文件)
2. [`import` 语法](#2-import-语法)
3. [`__dirname` 和 `fileURLToPath`](#3-__dirname-和-fileurltopath)
4. [`child_process` 的 `spawn` 和 `spawnSync`](#4-child_process-的-spawn-和-spawnsync)
5. [`stdout` / `stderr` 是什么](#5-stdout--stderr-是什么)
6. [脚本里的每一个正则表达式](#6-脚本里的每一个正则表达式)
7. [`async` / `await`、`Promise`、`setTimeout`](#7-async--awaitpromisesettimeout)
8. [`process.on('SIGINT')` 与 Ctrl+C](#8-processonsigint-与-ctrlc)
9. [`taskkill /PID /T /F` 与进程树](#9-taskkill-pid-t-f-与进程树)
10. [整体数据流：从运行到三个进程就绪](#10-整体数据流从运行到三个进程就绪)

---

## 1. 什么是 `.mjs` 文件

### 1.1 先记住一个词：模块

在写代码时，我们很少把所有的代码都塞进一个文件。相反，我们会把代码拆成一个个「模块」（module），一个文件就是一个模块，模块之间可以互相引用对方的变量和函数。

问题来了：**两个文件之间怎么「引用」？** JavaScript 历史上有两套互不兼容的方案，这就是我们要讲的第一组概念。

### 1.2 两套方案：CommonJS vs ES Module

| | **CommonJS**（老方案） | **ES Module / ESM**（新方案，标准） |
|---|---|---|
| 导入 | `const x = require('./a.js')` | `import x from './a.js'` |
| 导出 | `module.exports = x` | `export default x` / `export { x }` |
| 代表后缀 | `.js`（默认）、`.cjs` | `.mjs`，或 `.js` + `package.json` 声明 |
| 加载时机 | 运行时、同步 | 解析阶段就确定依赖 |
| 诞生背景 | 专为 Node.js 设计 | JavaScript 官方标准（浏览器也在用） |

- **CommonJS** 是 Node.js 早期自己发明的方案，用 `require` / `module.exports`。
- **ES Module（简称 ESM）** 是后来 JavaScript 官方标准定下来的方案，用 `import` / `export`，浏览器原生支持。

Node.js 一开始只支持 CommonJS。等到官方出了 ESM 标准，Node.js 也想跟上，但它**不能让老代码直接坏掉**——于是需要一个办法来区分「这个文件到底是哪种模块」。

### 1.3 `.mjs` 后缀的作用：一句话讲清

> **`.mjs` 后缀就是告诉 Node.js：这个文件用 ES Module 语法（`import`/`export`）。**

`.mjs` 里的 `m` 就是 **Module** 的缩写，代表这是一个 **ES Module**。

对应地：

- `.cjs` → 强制按 **CommonJS** 处理（`c` 是 CommonJS 的缩写）；
- `.mjs` → 强制按 **ES Module** 处理；
- `.js` → **看 `package.json` 里有没有写 `"type": "module"`**。写了就是 ESM，没写（或写了 `"commonjs"`）就是 CommonJS。

### 1.4 为什么这个脚本用 `.mjs` 而不是 `.js`

看脚本开头的这几行：

```js
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
```

这全是 `import` 语法。如果用 `.js`，Node.js 默认把它当成 CommonJS，那这几行 `import` 就会直接报语法错误（除非项目里配置了 `"type": "module"`）。

而这个项目很可能是这样的结构：既有 `bridge.js`（一个普通的 CommonJS 文件），也有 `start.mjs`。作者**不想为了这一个文件去改 `package.json`**，也不想把 `bridge.js` 也牵扯进来，所以最省事、最明确的办法就是：

> **直接给这个启动脚本命名为 `.mjs`，让 Node.js 一看就知道它要用 `import` 语法。**

这样一来，无论项目里其他文件是 CJS 还是 ESM，这个脚本自己都能被正确解析。

> 小结：`.mjs` = 明确声明「我是 ES Module」。作者选它，是因为这个脚本从头到尾都在用 `import`，而项目里还有用 `require` 的老文件，互不干扰。

---

## 2. `import` 语法

ES Module 的导入分两种：**具名导入**和**默认导入**。脚本里两种都用到了。

### 2.1 具名导入（花括号）

```js
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
```

- 花括号 `{ spawn, spawnSync }` 表示「从这个模块里，挑出叫 `spawn` 和 `spawnSync` 的两个东西」。
- 这要求被导入的模块**导出（export）了这两个名字**。

### 2.2 默认导入（不带花括号）

```js
import fs from 'node:fs';
import path from 'node:path';
```

- 不带花括号，表示「导入这个模块的**默认导出**（default export）」。
- `fs`、`path` 是 Node.js 的内置模块，它们的默认导出就是整个模块对象。

### 2.3 `node:` 前缀是什么

```js
'node:child_process'
'node:url'
'node:fs'
'node:path'
```

`node:` 前缀是 **Node.js 内置模块的官方标记**。它有两个好处：

1. **一眼看出这是内置模块**，而不是你项目里的某个文件（`./xxx` 或 `../xxx`）。
2. **避免被第三方同名包「抢名」**：假如有人发布了一个 npm 包也叫 `fs`，你 `import fs from 'node:fs'` 就永远不会误引到它。

> 小结：`import` 是 ESM 的导入语句。花括号是「点名要」，不带花括号是「要默认导出」，`node:` 前缀表示「这是 Node 自带的」。

---

## 3. `__dirname` 和 `fileURLToPath`

这是脚本里最容易让初学者困惑的两行：

```js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

我们要拆成三个问题：`__dirname` 是什么？ESM 里为什么没有它？这行代码是怎么把它「造」出来的？

### 3.1 `__dirname` 是什么

`__dirname` 是「**当前这个文件所在的文件夹的绝对路径**」。

比如你的文件在 `G:\AI\dsh\dsh-mobile\start.mjs`，那么在这个文件里，`__dirname` 的值就是：

```
G:\AI\dsh\dsh-mobile
```

它是一个**目录**路径（不包含文件名）。有了它，脚本就能定位「我旁边还有哪些文件」，比如下面的 `cloudflared.exe` 和 `bridge.js`：

```js
const CLOUDFLARED = path.join(__dirname, 'cloudflared.exe');
//                                    ↓ 用 path.join 把目录和文件名拼起来
//                              G:\AI\dsh\dsh-mobile\cloudflared.exe

spawn('node', [path.join(__dirname, 'bridge.js')], { ... });
//               G:\AI\dsh\dsh-mobile\bridge.js
```

> 为什么用 `path.join` 而不是手写 `__dirname + '\\bridge.js'`？
> 因为 Windows 用 `\`，Linux/macOS 用 `/`。`path.join` 会自动用当前操作系统正确的分隔符，代码就能跨平台。

### 3.2 为什么 ES Module 里默认没有 `__dirname`

关键点：**`__dirname` 从来就不是 JavaScript 语言本身的东西，而是 CommonJS 的「特产」。**

Node.js 加载一个 CommonJS 文件时，会在内部把这个文件**包一层函数**，再往函数里塞几个「现成变量」：

```js
// 这是 Node.js 内部帮你做的大概样子（伪代码，理解用）
function (exports, require, module, __filename, __dirname) {
    // —— 你的文件内容被塞在这里 ——
    // 所以你在 CommonJS 文件里能直接用 __dirname、__filename、require……
}
```

因此，在 CommonJS 里，`__dirname`、`__filename`、`require`、`module`、`exports` 这五个变量是**天生就有**的。

但 **ES Module 没有这套「包函数」机制**，所以这些变量一个都没有。你在 `.mjs` 里直接写 `__dirname` 会得到 `ReferenceError: __dirname is not defined`。

### 3.3 那 ESM 里怎么拿到目录路径？

ESM 给了你另一个东西：**`import.meta.url`**。

`import.meta.url` 是当前模块自己的地址，但它是 **`file://` 形式的 URL**，长这样：

```
file:///G:/AI/dsh/dsh-mobile/start.mjs
```

注意：它带 `file://` 前缀，斜杠是 `/`，而且特殊字符可能被**百分号编码**（比如空格会变成 `%20`）。这不能直接当文件路径用。

于是需要两步转换：

```js
import { fileURLToPath } from 'node:url';

fileURLToPath(import.meta.url)
// file:///G:/AI/dsh/dsh-mobile/start.mjs  →  G:\AI\dsh\dsh-mobile\start.mjs
```

- `fileURLToPath`：把 `file://` URL 还原成**操作系统能识别的文件路径**。
- 得到的是 `...\start.mjs`，也就是**文件的完整路径**（带文件名）。

最后再用 `path.dirname` 去掉文件名，只留目录：

```js
path.dirname('G:\\AI\\dsh\\dsh-mobile\\start.mjs')
//  →  'G:\\AI\\dsh\\dsh-mobile'
```

所以整行合起来就是：

```js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
//                └── 取目录 ──┘ └── URL→路径 ──┘ └── 当前文件地址 ──┘
```

**从右往左读**：拿到「当前文件的 URL」→ 转成「文件路径」→ 取「所在目录」→ 存进一个我们**自己声明的**、名叫 `__dirname` 的变量。

> 这里 `__dirname` 只是作者起的变量名，跟 CommonJS 里那个内置变量**功能一样、来历不同**：一个是 Node 白送的，一个是我们自己算出来的。

---

## 4. `child_process` 的 `spawn` 和 `spawnSync`

这个脚本的核心能力是「**启动别的程序**」。在 Node.js 里，这靠内置模块 `child_process` 完成。

### 4.1 什么是「子进程」

你的 `start.mjs` 运行起来，就是一个 **Node.js 进程**（进程 = 一个正在运行的程序实例）。

脚本要再启动 `dsh`、`node bridge.js`、`cloudflared.exe`，它们就分别成为 **子进程（child process）**——由你的脚本「生」出来的、独立运行的程序。

`child_process` 模块提供了好几个「生小孩」的函数，脚本里用到了两个：`spawn` 和 `spawnSync`。

### 4.2 `spawn`：异步启动，边跑边看输出

`spawn` 是**异步**的：它启动子进程后**立刻返回**，不会卡住你的脚本，你可以在子进程运行的同时继续干别的（比如去监听它的输出）。

```js
const dsh = spawn('dsh --profile web --no-open', {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
```

`spawn` 返回一个 **ChildProcess 对象**（这里存进 `dsh`），上面挂着很多有用的东西，比如：

- `.pid`：子进程的进程 ID；
- `.stdout` / `.stderr`：用来读子进程输出的流（下一节细讲）；
- `.kill()`：尝试结束子进程。

**参数含义**，逐个讲：

#### `spawn(命令, 参数数组, 选项)`

第一个参数是**要运行的程序**，第二个参数是**传给它的参数**（数组），第三个是**配置选项**。

看桥和隧道这两个更规范的例子：

```js
// 桥：程序是 node，参数是 [bridge.js 的完整路径]
spawn('node', [path.join(__dirname, 'bridge.js')], { stdio: ['ignore', 'pipe', 'pipe'] });

// 隧道：程序是 cloudflared.exe，参数是 tunnel --url http://localhost:端口
spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${bridgePort}`], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
```

把程序和参数**分开传**，好处是：特殊字符（空格、`&`、`>` 等）不会被 shell 错误解析，更安全、更可控。

而 DSH 那个写法不一样，它把整个命令揉成了一串字符串：

```js
spawn('dsh --profile web --no-open', { shell: true, ... });
```

这必须配合下面的 `shell: true` 一起看。

#### 选项 `shell`：要不要经过「命令行外壳」帮你解释命令

- **`shell: true`**：Node 会先启动一个系统 shell（Windows 上是 `cmd.exe`，Linux/macOS 是 `/bin/sh`），由 shell 来执行你的命令字符串。
- **`shell: false`（默认）**：Node 直接启动你指定的程序，不经过 shell。

为什么 DSH 这里**必须**用 `shell: true`？代码注释已经点明了：

```js
shell: true, // .cmd 需要 shell；整串命令传参，避开 DEP0190 警告
```

原因有两点：

1. **`dsh` 是一个 `.cmd` 批处理文件**（在 Windows 上，npm 全局安装的命令通常是 `dsh.cmd`）。`.cmd` 文件**不能直接被操作系统执行**，必须由 `cmd.exe` 来解析运行。所以得让 shell 介入。
2. 脚本想直接传一整串 `'dsh --profile web --no-open'`，这种「命令+参数拼在一起」的写法，也只有在 `shell: true` 下才成立（因为 shell 负责把这一串拆开）。如果不加 `shell`，Node 会以为有个程序真的叫 `dsh --profile web --no-open`（带空格），就会找不到。而如果加了 shell 又把命令拆成数组传，Node 高版本会弹出一个 **DEP0190 弃用警告**，所以作者干脆「整串传 + shell:true」，干净利落。

> 代价：`shell: true` 会多出一层中间进程（`cmd.exe`）。这层中间进程正是后面第 9 节「为什么要用 taskkill 杀整棵树」的伏笔。

#### 选项 `stdio`：三个通道各自怎么接

`stdio` 是「standard I/O（标准输入输出）」的缩写，它配置子进程的**三个标准通道**：

| 下标 | 通道 | 含义 |
|---|---|---|
| `stdio[0]` | **stdin** | 标准输入（往里喂数据） |
| `stdio[1]` | **stdout** | 标准输出（正常输出） |
| `stdio[2]` | **stderr** | 标准错误（错误输出） |

每个位置可以填：

- **`'pipe'`**：Node 建一根「管道」，把子进程的这个通道接出来，你可以在代码里读它（`child.stdout` / `child.stderr`）。
- **`'ignore'`**：直接丢弃，不读。
- **`'inherit'`**：子进程直接用「你（父进程）的」那个通道，即原样打到你的终端。

对照脚本：

```js
// DSH：stdin 丢弃，stdout 和 stderr 都要接出来读
stdio: ['ignore', 'pipe', 'pipe'],

// 桥：同上，两个输出都要读
stdio: ['ignore', 'pipe', 'pipe'],

// 隧道：stdin 丢弃，stdout 丢弃，只读 stderr（因为 URL 打在 stderr 上，见第 5 节）
stdio: ['ignore', 'ignore', 'pipe'],
```

#### 选项 `windowsHide`：别让黑窗口乱闪

- **`windowsHide: true`**：在 Windows 上，子进程**不会**弹出/闪烁一个新的控制台窗口，它在后台安静运行。
- 三个子进程都开了这个（或省略时默认行为类似），因为作为一键启动器，你不想每起一个程序就「啪」地冒一个黑色命令行窗口出来。

> 注：`windowsHide` 在非 Windows 系统上无效，但不报错，所以代码可以放心写。

### 4.3 `spawnSync`：同步启动，等它跑完再继续

`spawnSync` 是 `spawn` 的「阻塞版」：它会**卡住你的脚本，直到那个命令彻底跑完**，然后一次性返回结果（含退出码、输出等）。

脚本里只在一处用到它——杀进程：

```js
spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
```

为什么要同步？因为「杀进程」这个动作需要**等它执行完、确保子进程真的死了**，脚本才放心继续（比如紧接着要 `process.exit(0)` 退出）。如果用异步的 `spawn`，可能还没杀干净，脚本自己就退出了。

这里 `stdio: 'ignore'` 表示我们**不在乎 taskkill 打印了什么**，直接丢弃；`windowsHide: true` 同样是别让 `taskkill` 弹黑窗口。

> 小结：
> - `spawn` = 异步起进程，返回对象，边跑边读输出；
> - `spawnSync` = 同步起进程，阻塞到结束；
> - `shell` 决定「要不要 cmd.exe 帮你解释命令」；
> - `stdio` 决定「stdin/stdout/stderr 三个通道怎么接」；
> - `windowsHide` 决定「Windows 上要不要藏起黑窗口」。

---

## 5. `stdout` / `stderr` 是什么

### 5.1 两个「出水口」

Unix 有一个经典设计：**每个进程默认拥有两个「输出口」**。

- **stdout（标准输出）**：程序「正常」说的话。比如打印日志、打印结果。
- **stderr（标准错误）**：程序「报错/告警」说的话。

它们看起来都只是「打印文字」，但对程序来说是两个**分开的管道**。这样的好处是：你可以只保留正常输出、丢弃错误输出，或反过来。

很多命令行工具会「故意」把不同信息分流：

- 正常结果 → stdout；
- 错误、警告、或**调试/日志类**信息 → stderr。

### 5.2 为什么脚本要从这两个流里「抓」token 和 URL

这是整个脚本最巧妙的思路：**它不猜、不写死，而是实时监听子进程的输出来获取关键信息。**

- `dsh` 启动后，会在自己的输出里打印类似 `token=xxxxx` 和 `http://192.168.x.x:3080` 的内容 → 脚本从 **stdout** 里抓。
- 桥（`bridge.js`）启动后，会打印 `listening on http://0.0.0.0:端口号` → 脚本从 **stdout** 里抓端口。
- `cloudflared` 启动隧道后，会把生成的公网地址（`https://xxx.trycloudflare.com`）打在 **stderr** 上（这是 cloudflared 的习惯）→ 脚本从 **stderr** 里抓。

而这些 token、端口、URL **每次都不同**（随机生成），你不可能提前写死在代码里。所以唯一靠谱的办法就是：**起进程 → 听输出 → 用正则把值抠出来**。

### 5.3 代码里怎么「听」

```js
dsh.stderr.on('data', (c) => process.stdout.write(`[dsh:err] ${c}`));
```

- `dsh.stderr` 是一个**流（Stream）**，数据不是一次性全来，而是一段一段（`chunk`）到达。
- `.on('data', 回调)` 表示「每当有一块数据到达，就执行回调」。回调参数 `c` 是这一块数据（Buffer），拼进字符串里回显到自己的终端，并加个 `[dsh:err]` 前缀方便区分来源。

真正「抓取」的核心是 `watch` 函数，我们在第 6、7 节细看。

> 小结：stdout 是「正常输出」，stderr 是「错误/日志输出」。脚本通过监听这两个流，实时获取随机生成的 token、端口和隧道 URL，而不是硬编码。

---

## 6. 脚本里的每一个正则表达式

正则表达式（RegExp）是一种「用符号描述文字模式」的工具，用来在文本里**找**符合模式的内容。脚本里有四个正则，我们逐个拆开，连每个字符都不放过。

### 6.1 抓 token：`/token=([A-Za-z0-9_-]+)/`

```js
await watch(dsh, 'stdout', /token=([A-Za-z0-9_-]+)/, 'dsh', 60000);
```

这个正则用来在 DSH 的输出里找到 `token=xxxxxxxx` 这样的字样。逐字符拆解：

| 片段 | 含义 |
|---|---|
| `token=` | 字面量，必须原样匹配这 6 个字符 `t` `o` `k` `e` `n` `=` |
| `(` … `)` | **捕获组**：把括号里匹配到的内容「单独记下来」，之后可以通过 `match[1]` 取出来 |
| `[A-Za-z0-9_-]` | **字符类**，匹配「一个」字符，且必须是以下之一：大写字母 `A-Z`、小写字母 `a-z`、数字 `0-9`、下划线 `_`、连字符 `-` |
| `+` | 修饰前面的字符类，表示「**一个或多个**」 |

**整体意思**：找到 `token=`，然后把后面连续的一个或多个「字母/数字/下划线/连字符」捕获下来。

> 关于 `[A-Za-z0-9_-]` 里那个 `-`：在字符类里，`-` 放在**最后**，所以它被当成**字面连字符**，而不是「范围符号」（像 `A-Z` 那样的范围）。这是个小细节。

匹配成功后，脚本这样取出 token：

```js
const { match } = await watch(dsh, 'stdout', ...);
token = match[1];   // match[1] 就是第一个捕获组里的内容
```

> `match[0]` 是「整个匹配到的字符串」（如 `token=abc123`），`match[1]` 才是「捕获组里的内容」（如 `abc123`）。

### 6.2 抓 host（局域网 IP）：`/http:\/\/([0-9.]+):/g`

```js
const hosts = [...buffer.matchAll(/http:\/\/([0-9.]+):/g)].map((m) => m[1]);
```

这个正则用来在 DSH 的输出里找出所有形如 `http://192.168.8.219:3080` 的地址中的 **IP 部分**。逐段拆：

| 片段 | 含义 |
|---|---|
| `http:` | 字面量 `http:` |
| `\/\/` | `\/` 是「转义后的 `/`」。因为正则的定界符本身用 `/` 包裹，所以正则里的斜杠要写成 `\/`，实际匹配的就是 `//` |
| `(` … `)` | 捕获组 |
| `[0-9.]` | 字符类，匹配「一个」数字 `0-9` 或点 `.`。注意：**在字符类里 `.` 不用转义**，它就代表字面的点 |
| `+` | 一个或多个 |
| `:` | 字面量冒号 |
| `g` | **全局标志**（global）：不要找到第一个就停，把整段文本里**所有**匹配都找出来 |

**整体意思**：找出所有 `http://` 开头、后面跟一串「数字和点」、再跟一个冒号的内容，并把中间那串「数字和点」捕获下来。

为什么用 `matchAll` 而不是 `match`？

- `match`（不带 `g`）只返回**第一个**匹配，且带捕获组信息；
- `match`（带 `g`）会返回所有匹配，但**只给完整匹配串，不给捕获组**；
- `matchAll`（配合 `g`）返回所有匹配，且**每个都带捕获组**。

脚本需要的是「所有 IP」，所以用 `matchAll`，再用展开运算符 `[...]` 转成数组，用 `.map((m) => m[1])` 取出每个匹配的捕获组（IP）。

接着从中挑一个合适的：

```js
host = hosts.find((h) => h !== '127.0.0.1') || hosts[0] || host;
```

逻辑：先找**第一个不是 `127.0.0.1`** 的 IP（因为 `127.0.0.1` 是「本机回环地址」，手机连不上，要排除掉）；如果全是 `127.0.0.1`，就退回 `hosts[0]`（第一个）；如果压根没匹配到任何 IP，就用最开始预设的默认值 `192.168.8.219`（代码开头 `let host = '192.168.8.219'`）。

### 6.3 抓桥端口：`/listening on http:\/\/0\.0\.0\.0:(\d+)/`

```js
await watch(bridge, 'stdout', /listening on http:\/\/0\.0\.0\.0:(\d+)/, 'bridge', 10000, ...);
```

这是桥（`bridge.js`）启动成功后打印的一行，例如：

```
listening on http://0.0.0.0:8080
```

脚本要从这行里取出**端口号**。逐段拆：

| 片段 | 含义 |
|---|---|
| `listening on http:` | 字面量 `listening on http:` |
| `\/\/` | 转义后的 `//` |
| `0\.0\.0\.0` | `0.0.0.0`。这里的 `.` 都写了 `\.` 转义，因为**在字符类外**，`.` 是特殊符号（匹配任意字符），必须转义才能表示「字面的点」 |
| `:` | 字面量冒号 |
| `(` … `)` | 捕获组 |
| `\d+` | `\d` 表示「数字」（等价于 `[0-9]`），`+` 表示一个或多个 |

**整体意思**：找到 `listening on http://0.0.0.0:`，然后捕获后面的一串数字（即端口号）。

> 对比一下 6.2 和 6.3 里 `.` 的两种写法：
> - `[0-9.]` 里，`.` 在**字符类内部**，本来就是字面量，不用转义；
> - `0\.0\.0\.0` 里，`.` 在**字符类外部**，是「任意字符」通配符，必须 `\.` 转义。
>
> 同一个 `.`，位置不同，含义不同——这是正则新手最容易踩的坑之一。

取出端口后转成数字：

```js
bridgePort = Number(match[1]);
```

> 端口从输出里「现取」而不写死，是作者的刻意设计（注释里写明「不写死」）。因为端口可能被占用后自动换一个，写死反而容易错。

### 6.4 抓隧道 URL：`/https:\/\/[a-z0-9-]+\.trycloudflare\.com/`

```js
await watch(cf, 'stderr', /https:\/\/[a-z0-9-]+\.trycloudflare\.com/, 'cf', 60000, { quiet: true });
```

`cloudflared` 启动快速隧道后，会在输出里打印一个公网地址，形如：

```
https://random-words-here.trycloudflare.com
```

逐段拆：

| 片段 | 含义 |
|---|---|
| `https:` | 字面量 `https:` |
| `\/\/` | 转义后的 `//` |
| `[a-z0-9-]` | 字符类：小写字母 `a-z`、数字 `0-9`、连字符 `-`。`-` 在最后，是字面连字符 |
| `+` | 一个或多个 |
| `\.trycloudflare\.com` | 字面量 `.trycloudflare.com`（点都转义了） |

**整体意思**：找到 `https://` 开头，后面跟一串「小写字母/数字/连字符」，再接 `.trycloudflare.com` 的完整网址。

这个正则**没有捕获组**（没有括号），所以脚本直接取整个匹配串：

```js
tunnelUrl = match[0];   // 没有捕获组，用 match[0] 取整段匹配
```

注意隧道是监听 **stderr**（`watch(cf, 'stderr', ...)`）——因为 cloudflared 习惯把这类日志打到 stderr，而不是 stdout。这正是第 5 节「两个出水口」的现实例子。

> 小结：四个正则，一个抓 token，一个抓 IP，一个抓端口，一个抓公网 URL。核心技巧就三样：**字面量**（照原样匹配）、**字符类 `[...]`**（限定一个字符的可选范围）、**捕获组 `(...)`**（把想要的部分单独拎出来）。

---

## 7. `async` / `await`、`Promise`、`setTimeout`

这三样配合，解决了脚本里一个关键难题：**「启动进程 → 等它打印出某句话」这件事是异步的**，怎么在代码里优雅地「等」？

### 7.1 `Promise`：把「未来某刻才有的结果」包装成对象

先看 `watch` 函数，它返回一个 Promise：

```js
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
```

**Promise 是什么？** 一个 Promise 代表「一个**将来**才会有结果的操作」。它有三种状态：

- **pending**（进行中）；
- **fulfilled / resolved**（成功）—— 调用了 `resolve(结果)`；
- **rejected**（失败）—— 调用了 `reject(错误)`。

`watch` 干的事，翻译成人话：

1. 盯住子进程的某个流（`stream = child[streamName]`，即 `child.stdout` 或 `child.stderr`）。
2. 用一个 `buf` 把流里来的文本**一段段累积**起来（`buf += text`）。
3. 每次来新数据，就用正则 `regex` 试一下（`buf.match(regex)`）。
4. **一旦匹配到** → `clearTimeout(timer)` 取消超时，然后 `resolve({ match, buffer })`，Promise 成功结束，把匹配结果交出去。
5. **如果等太久（超时）** → `reject(错误)`，Promise 失败。
6. **如果子进程提前退出**（`exit` 事件）→ 也 `reject(错误)`，说明还没等到那句话程序就死了。

`tail = () => buf.slice(-1200)` 是「取最近 1200 个字符」，专门用来在报错时给用户看「它最后打印了什么」，方便排查。

### 7.2 `setTimeout`：超时保险丝

```js
const timer = setTimeout(
  () => reject(new Error(`${label} 超时：${timeoutMs}ms 内没匹配到 ${regex}\n最近输出：\n${tail()}`)),
  timeoutMs,
);
```

- `setTimeout(回调, 毫秒数)`：**延迟指定毫秒后**执行回调。这里就是「过了 `timeoutMs` 毫秒还没匹配到，就判定失败、reject」。
- `timeoutMs` 是调用 `watch` 时传的：DSH 给 60000ms（1 分钟），桥给 10000ms（10 秒），隧道给 60000ms（1 分钟）。
- 返回的 `timer` 是个「定时器句柄」，`clearTimeout(timer)` 可以**取消**它。所以一旦匹配成功或进程退出，就先取消超时，避免「已经成功了又报超时」。

> 为什么需要超时？因为如果某个程序一直不打印我们要的那句话（比如启动失败、卡住），`watch` 就会**永远等下去**，整个脚本就僵死了。超时是兜底。

### 7.3 `async` / `await`：让「异步」写得像「同步」

`await` 只能用在 `async` 函数里。它的作用是：**等待一个 Promise 结束，拿到它的结果**，然后再往下走。这样代码看起来是「一行一行顺序执行」，但底层不卡死主线程。

脚本主线 `main` 就是一个 `async` 函数，里面三次 `await watch(...)`：

```js
async function main() {
  // ...起 DSH...
  const { match, buffer } = await watch(dsh, 'stdout', /token=([A-Za-z0-9_-]+)/, 'dsh', 60000);
  token = match[1];
  // ↑ 这一行会「等」到 token 被抓到（或超时/退出）才继续

  // ...起桥...
  const { match } = await watch(bridge, 'stdout', /listening on http:\/\/0\.0\.0\.0:(\d+)/, 'bridge', 10000, {...});
  bridgePort = Number(match[1]);
  // ↑ 等桥端口抓到才继续

  // ...起隧道...
  const { match } = await watch(cf, 'stderr', /https:\/\/[a-z0-9-]+\.trycloudflare\.com/, 'cf', 60000, { quiet: true });
  tunnelUrl = match[0];
  // ↑ 等隧道 URL 抓到才继续
}
```

**为什么必须按顺序等？** 因为后面的步骤**依赖前面的结果**：

- 起桥之前，需要先拿到 token/host（而且要让 DSH 先起来）；
- 起隧道之前，**必须先知道桥的端口**（`http://localhost:${bridgePort}` 就是转发目标）——端口是桥跑起来后才知道的，所以必须 `await` 桥那一行；
- 打印汇总之前，三个值都得齐。

> 顺序图：等 DSH → 拿 token/host → 等桥 → 拿端口 → 用端口起隧道 → 等 URL → 汇总。

### 7.4 顶层怎么触发

`async` 函数不会自动执行，所以脚本最后：

```js
main().catch((e) => {
  console.error('启动失败：', e);
  killAll();
  process.exit(1);
});
```

- `main()` 调用它，返回一个 Promise。
- `.catch(...)` 接住任何「没被内部 try/catch 处理的意外错误」，打印并清理所有子进程，然后以退出码 1（表示失败）退出。

> 小结：
> - `Promise` = 「未来才有结果」的操作的容器，靠 `resolve`/`reject` 定结果；
> - `setTimeout` = 超时保险丝，防止无限等；
> - `async`/`await` = 让等待 Promise 的代码写得像顺序执行，因为步骤之间有依赖，必须一个个等。

---

## 8. `process.on('SIGINT')` 与 Ctrl+C

### 8.1 什么是「信号（Signal）」

操作系统里，一个进程可以给另一个进程发「信号」，有点像「打断一下，有事通知你」。信号只有名字，不带复杂数据，常见的有：

- **SIGINT** —— Interrupt，「中断」。你在终端按 **Ctrl+C**，就是向前台进程发 SIGINT。
- SIGTERM —— 请求优雅退出。
- SIGKILL —— 强制立刻杀死（无法被程序拦截）。

### 8.2 Ctrl+C 发生了什么

你在终端运行 `node start.mjs` 时，这个 Node 进程是「前台进程」。你按下 **Ctrl+C**，终端（更准确说是操作系统/终端驱动）就向这个前台进程发送一个 **SIGINT** 信号。

Node 进程默认收到 SIGINT 会**直接退出**。但在这个脚本里，它不想「直接死」——因为它手底下还挂着三个子进程（DSH、桥、cloudflared），必须先**清理干净**再走。

于是脚本注册了一个信号处理器：

```js
process.on('SIGINT', () => {
  console.log('\n\n收到 Ctrl+C，正在停止 DSH / 桥 / 隧道…');
  killAll();
  process.exit(0);
});
```

- `process.on('SIGINT', 回调)`：注册「当收到 SIGINT 信号时，执行这个回调」。
- 回调里先打印提示，再调用 `killAll()` 杀掉所有子进程，最后 `process.exit(0)` 主动退出（0 表示正常退出）。

> 为什么要主动 `process.exit(0)`？因为一旦你注册了 SIGINT 处理器，Node 就**不再默认自动退出**了——需要你显式地结束进程，否则程序会一直挂着。

### 8.3 不清理会怎样

如果收到 Ctrl+C 直接退出、不杀子进程，那三个子进程会变成「**孤儿进程**」：父进程死了，它们还在后台运行，继续占着端口。下次你再运行 `start.mjs`，就会端口冲突、起不来。所以「先杀孩子，再自己退」是负责任的退出流程。

---

## 9. `taskkill /PID /T /F` 与进程树

### 9.1 先看这段「杀全家」的代码

```js
const children = [];                    // 记录所有子进程
const track = (c) => { children.push(c); return c; };

const killAll = () => {
  for (const c of children) {
    if (!c.pid) continue;
    try {
      spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      try { c.kill(); } catch { /* noop */ }
    }
  }
};
```

- `children` 是个数组，`track` 负责把每个 `spawn` 出来的子进程塞进去（所以每个 `spawn(...)` 外面都包了一层 `track(...)`）。
- `killAll` 遍历它们，逐个用 `taskkill` 杀掉。

### 9.2 `taskkill` 三个参数各是什么

`taskkill` 是 **Windows 自带**的命令行工具，专门用来结束进程。这里用到的三个开关：

| 参数 | 全称 | 作用 |
|---|---|---|
| `/PID <id>` | Process ID | 指定「要杀哪个进程」（用进程 ID 定位） |
| `/T` | Tree | **连同它的整棵进程树一起杀**（包括它的子进程、孙进程……） |
| `/F` | Force | 强制结束（不给进程「慢慢退出」的机会） |

合起来 `/PID xxx /T /F` 的意思：**把 ID 为 xxx 的进程，连同它底下所有子子孙孙，全部强制杀掉。**

### 9.3 什么是「进程树」和「孤儿进程」

进程和进程之间有「父子关系」：一个进程启动另一个进程，前者是父、后者是子。这样层层嵌套，就形成一棵**树**：

```
node start.mjs
 └─ cmd.exe                        ← DSH 用 shell:true 启动，第一层是 cmd.exe
     └─ dsh.cmd 脚本                ← cmd 执行的批处理
         └─ DeepSeek Harness.exe   ← 真正的 Electron 主进程
             └─ (Electron 渲染/GPU 等一堆子进程)
```

**孤儿进程**：如果父进程死了，子进程「没有爹了」，就成了孤儿进程，但它**仍然活着、仍然占着资源**（比如端口 3080）。

### 9.4 为什么 `child.kill()` 不够，必须用 `taskkill /T /F`

这是脚本注释里专门强调的「关键点」：

```js
// 关键：用 taskkill /T /F 杀整棵进程树，而不是 child.kill()。
// 因为 DSH 是 shell:true 起的（cmd.exe → dsh.cmd → DeepSeek Harness.exe），
// child.kill() 只杀 cmd.exe 这一层，会留下 Electron 孙进程继续占着 3080。
```

拆开理解：

1. `spawn('dsh ...', { shell: true })` 时，Node 真正直接启动的那个进程其实是 **`cmd.exe`**。
2. `child` 对象（`dsh`）的 `.pid` 指向的就是这个 **`cmd.exe`** 的 PID。
3. 如果调用 `dsh.kill()`，它**只向 `cmd.exe` 这一个进程发信号**，把它杀掉。
4. 但 `cmd.exe` 底下还有 `dsh.cmd` → `DeepSeek Harness.exe` → Electron 一堆孙进程。`cmd.exe` 死了，这些孙进程**不一定跟着死**，很可能变成孤儿，继续霸占 3080 端口。
5. 所以必须用 `taskkill /PID <cmd.exe的pid> /T`：`/T` 会顺着树往下，把**所有子子孙孙一起杀干净**，`/F` 保证「强制、不商量」。

> 一句话：`child.kill()` 只杀「第一层」，`taskkill /T` 杀「整棵树」。因为 `shell:true` 把真正的程序藏在了 `cmd.exe` 后面，所以必须连根拔起。

代码里那个 `try/catch` 是兜底：

```js
} catch {
  try { c.kill(); } catch { /* noop */ }
}
```

万一 `taskkill` 本身失败（比如在非 Windows 系统上没有 taskkill），就退回用 `child.kill()` 至少杀掉第一层；连这也失败，就什么都不做（`/* noop */` = no operation，空操作）。

> 这也解释了为什么桥和隧道虽然没用 `shell:true`，也统一走 `taskkill`：统一逻辑、更彻底、也更保险。

---

## 10. 整体数据流：从运行到三个进程就绪

现在把所有知识点串起来，看一次完整运行。

### 第 0 步：`node start.mjs`

你在项目根目录执行：

```bash
node start.mjs
```

Node 读到 `.mjs` 后缀，按 **ES Module** 解析，顺利执行那些 `import`。`main()` 被调用，脚本开工。

### 第 1 步：先做安全检查

```js
if (!fs.existsSync(CLOUDFLARED)) { ... process.exit(1); }
```

用 `fs.existsSync` 检查 `cloudflared.exe` 是否就在脚本同目录（`__dirname` 拼出来的路径）。不在就直接报错退出——因为后面第 4 步必须用它。

### 第 2 步：启动 DSH，抓 token 和 host

```js
const dsh = track(spawn('dsh --profile web --no-open', { shell: true, stdio: ['ignore','pipe','pipe'], windowsHide: true }));
```

- 通过 `shell: true`（因为 `dsh` 是 `.cmd`）启动 DSH。
- `stdio` 把 stdout、stderr 都接成 `pipe`，准备读。
- `watch` 开始监听 stdout，用正则 `/token=([A-Za-z0-9_-]+)/` 找 token。

DSH 起来后，打印出含 `token=xxxx` 的行：

```
... token=AbC123_xyz ...
```

`watch` 的 `data` 回调里，`buf.match(regex)` 命中 → `resolve({ match, buffer })` → `await` 返回：

```js
token = match[1];                     // 拿到 token
const hosts = [...buffer.matchAll(/http:\/\/([0-9.]+):/g)].map(m => m[1]);
host = hosts.find(h => h !== '127.0.0.1') || hosts[0] || host;  // 挑一个局域网 IP
```

至此，**token + 局域网 IP（host）** 到手。若 60 秒内没抓到，`reject` 报超时，`killAll()` 清理后退出。

### 第 3 步：启动桥，抓端口

```js
const bridge = track(spawn('node', [path.join(__dirname, 'bridge.js')], { stdio: ['ignore','pipe','pipe'] }));
```

- 用 `node` 跑同目录下的 `bridge.js`。
- `watch` 监听 stdout，找 `/listening on http:\/\/0\.0\.0\.0:(\d+)/`。

桥启动并监听端口后，打印：

```
listening on http://0.0.0.0:8080
```

正则命中，捕获组取到 `8080`：

```js
bridgePort = Number(match[1]);   // 8080
```

> 这里「现取端口」而不是写死，是作者的刻意设计——端口由桥自己决定（可能因被占用而自动换），脚本照单全收。

### 第 4 步：用刚拿到的端口启动隧道，抓公网 URL

```js
const cf = track(spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${bridgePort}`], { stdio: ['ignore','ignore','pipe'] }));
```

- 启动 `cloudflared.exe`，命令是 `tunnel --url http://localhost:8080`（端口用的是上一步的 `bridgePort`）。
- 它把本机 `localhost:8080`（桥）通过快速隧道暴露到公网。
- `stdio` 里 **stderr 接 pipe**（URL 在 stderr 上）、stdout 丢弃。

`watch` 监听 stderr，用 `/https:\/\/[a-z0-9-]+\.trycloudflare\.com/` 等 URL。cloudflared 连上后打印：

```
... https://random-words.trycloudflare.com ...
```

正则命中，`match[0]` 就是完整公网地址：

```js
tunnelUrl = match[0];
```

### 第 5 步：汇总打印

```js
const lanBridgeUrl = `http://${host}:${bridgePort}`;   // 例如 http://192.168.8.219:8080
console.log('  token   :', token);
console.log('  局域网   :', lanBridgeUrl);
console.log('  互联网   :', tunnelUrl);
```

三条信息齐全：token、局域网地址（手机和电脑同一 Wi-Fi 时用）、互联网地址（任何网络都能用）。用户把它们填进手机 App 即可连接。

### 第 6 步：等你按 Ctrl+C

之后脚本就一直「挂」着（因为三个子进程还在跑，`main` 已经执行完但子进程活着，Node 不会自动退出）。你按 **Ctrl+C**：

1. Node 进程收到 **SIGINT**；
2. 触发 `process.on('SIGINT', ...)` 里的回调；
3. 打印「收到 Ctrl+C，正在停止…」；
4. `killAll()` 用 `taskkill /PID /T /F` 把 DSH（连同它的 Electron 孙进程）、桥、隧道**整棵树**杀干净；
5. `process.exit(0)`，脚本干净退出，端口全部释放。

---

## 完整流程图

```
node start.mjs
      │
      ├─ 检查 cloudflared.exe 存在？
      │       └─ 不存在 → 报错退出
      │
      ├─ [1/3] spawn dsh（shell:true）
      │         └─ watch(stdout)  → 抓 token=... 和 http://IP:port
      │               ├─ 命中 → token + host 到手
      │               └─ 超时/退出 → killAll + 退出
      │
      ├─ [2/3] spawn node bridge.js
      │         └─ watch(stdout)  → 抓 listening on http://0.0.0.0:端口
      │               └─ 命中 → bridgePort 到手
      │
      ├─ [3/3] spawn cloudflared tunnel --url http://localhost:bridgePort
      │         └─ watch(stderr)  → 抓 https://xxx.trycloudflare.com
      │               └─ 命中 → tunnelUrl 到手
      │
      ├─ 汇总打印：token / 局域网地址 / 互联网地址
      │
      └─ 等待 Ctrl+C
              └─ SIGINT → killAll()（taskkill /T /F 杀整棵进程树）→ exit(0)
```

---

## 一张速查表（复习用）

| 概念 | 一句话解释 | 在脚本里的位置 |
|---|---|---|
| `.mjs` | 声明「我是 ES Module」，用 `import`/`export` | 文件后缀 |
| `import { x }` / `import x` | 具名导入 / 默认导入 | 开头 4 行 |
| `node:` 前缀 | 标记 Node 内置模块 | `'node:child_process'` 等 |
| `__dirname` | 当前文件所在目录（CJS 白送，ESM 要自己算） | 第 18 行 |
| `import.meta.url` | 当前模块的 `file://` URL | 第 18 行 |
| `fileURLToPath` | 把 `file://` URL 转成系统路径 | 第 18 行 |
| `spawn` | 异步启动子进程 | 三个 `spawn(...)` |
| `spawnSync` | 同步启动、阻塞到结束 | `taskkill` 处 |
| `shell: true` | 经 `cmd.exe` 解释命令（`.cmd` 需要） | DSH 启动 |
| `stdio` | 配 stdin/stdout/stderr 三个通道 | 每次 `spawn` |
| `windowsHide` | Windows 下藏起黑窗口 | 每次 `spawn` |
| `stdout` / `stderr` | 正常输出 / 错误输出 | `watch` 监听 |
| 正则 | 从输出文本里抠 token/IP/端口/URL | `watch` 参数 |
| `Promise` | 包装「未来才有的结果」 | `watch` 返回 |
| `setTimeout` | 超时兜底 | `watch` 内部 |
| `async`/`await` | 让等 Promise 写得像顺序执行 | `main` |
| `SIGINT` | Ctrl+C 发的「中断」信号 | `process.on('SIGINT')` |
| `taskkill /T /F` | 连进程树一起强制杀（`child.kill()` 只杀第一层） | `killAll` |
