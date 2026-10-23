// update-persona.mjs —— 把 test.txt 写进 DSH「剧情主持人」人设的 prefix（仅改人设，不动其它配置）
//
// 用法：
//   node update-persona.mjs                 # 写默认路径 ~/.dsh/profiles/web/cordis.patch.yml
//   node update-persona.mjs <patch路径>      # 指定 cordis.patch.yml 路径
//
// 前置：脚本同目录放一个 test.txt，内容就是新的提示词（支持多行、含空行、中文）。
// 说明：只替换 persona 插件下的 prefix 块，其余（webserver / agent-default-model 等）原样保留；
//       写回前会先备份一份 <patch>.bak。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TXT = path.join(__dirname, 'test.txt');
const PATCH = process.argv[2] || path.join(os.homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml');

const fail = (msg) => {
  console.error('❌ ' + msg);
  process.exit(1);
};

if (!fs.existsSync(TXT)) fail(`找不到 ${TXT}，请先在脚本同目录放一个 test.txt`);
if (!fs.existsSync(PATCH)) fail(`找不到 ${PATCH}`);

const rawPatch = fs.readFileSync(PATCH, 'utf8');
const EOL = rawPatch.includes('\r\n') ? '\r\n' : '\n';
const lines = rawPatch.replace(/\r\n/g, '\n').split('\n');
const txt = fs.readFileSync(TXT, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');

if (!txt.trim()) fail('test.txt 内容为空，请先填入提示词');

// 1. 定位 prefix: | 行（剧情主持人的 persona 前缀）
let prefixLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^\s*prefix:\s*\|\s*$/.test(lines[i])) {
    prefixLine = i;
    break;
  }
}
if (prefixLine < 0) fail('没找到 prefix: | 行');

const prefixIndent = (lines[prefixLine].match(/^\s*/) || [''])[0].length;

// 2. 内容块结束 = 第一个「非空且缩进 <= prefixIndent」的行（空行属于内容）
let endLine = prefixLine + 1;
while (endLine < lines.length) {
  const line = lines[endLine];
  if (line.trim() !== '' && (line.match(/^\s*/) || [''])[0].length <= prefixIndent) break;
  endLine++;
}

// 3. 取原内容缩进（第一行非空内容的缩进），新内容沿用同一缩进
let contentIndent = prefixIndent + 2;
for (let i = prefixLine + 1; i < endLine; i++) {
  if (lines[i].trim() !== '') {
    contentIndent = (lines[i].match(/^\s*/) || [''])[0].length;
    break;
  }
}
const pad = ' '.repeat(contentIndent);

// 4. 新内容 = txt 每行加缩进，空行保持空
const newContent = txt.split('\n').map((l) => (l === '' ? '' : pad + l)).join('\n');

// 5. 备份 + 写回（保持原换行符）
const bak = PATCH + '.bak';
fs.writeFileSync(bak, rawPatch, 'utf8');

const out = [...lines.slice(0, prefixLine + 1), newContent, ...lines.slice(endLine)].join('\n').replace(/\n/g, EOL);
fs.writeFileSync(PATCH, out, 'utf8');

console.log('✅ 已更新「剧情主持人」人设 prefix');
console.log('   目标文件:', PATCH);
console.log('   备份文件:', bak);
console.log('   提示词来源:', TXT, '(' + txt.length + ' 字符)');
console.log('   替换范围: 第 ' + (prefixLine + 2) + ' ~ ' + endLine + ' 行');
