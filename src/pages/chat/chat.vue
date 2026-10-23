<template>
  <view class="content">
    <side-menu />
    <side-bar />

    <!-- 连接状态灯 + 手动重连 -->
    <view class="conn-bar">
      <view class="conn-dot" :class="connLight" />
      <text class="conn-text">{{ connText }}</text>
      <text v-if="wsStatus === 'disconnected'" class="reconnect" @click="manualReconnect">重连</text>
    </view>

    <!-- 消息列表 -->
    <scroll-view
      scroll-y
      class="msg-list"
      :scroll-top="scrollTopValue"
      @scroll="onScroll"
    >
      <template v-for="(b, i) in bubbles" :key="i">
        <view v-if="b.role === 'user'" :id="'msg-' + i" class="bubble" :class="b.role">
          <text>{{ bubbleText(b) }}</text>
        </view>
        <view v-if="b.role === 'assistant'" :id="'msg-' + i" class="bubble" :class="b.role">
          <markdown-view :text="bubbleText(b)" />
          <text v-if="bubbleUsage(b)" class="usage-line">{{ usageText(bubbleUsage(b)) }}</text>
        </view>
      </template>

      <!-- 当前 live assistant 消息：已完成块各自一个 markdown-view（不重渲染），尾巴纯文本 -->
      <view v-if="liveStream" id="msg-live" class="bubble assistant">
        <template v-for="(block, j) in liveParts.blocks" :key="j">
          <markdown-view :text="block" />
        </template>
        <text v-if="liveParts.tail" class="stream-tail">{{ liveParts.tail }}</text>
        <text v-if="liveStream.usage" class="usage-line">{{ usageText(liveStream.usage) }}</text>
      </view>

    </scroll-view>

    <!-- 回到底部悬浮按钮（用户上滑阅读时出现） -->
    <view v-if="showScrollBtn" class="scroll-down" @click="scrollToBottomNow">↓</view>

    <!-- 输入框 -->
    <view class="input-bar">
      <textarea
        v-model="draft"
        class="input"
        :maxlength="2000"
        auto-height
        confirm-type="send"
        placeholder="输入消息…"
        :disabled="!sessionId"
        @confirm="onSend"
      />
      <button v-if="isStreaming" class="stop-btn" size="mini" @click="stop">
        停止
      </button>
      <button v-else class="send-btn" size="mini" :disabled="!sessionId || sending" @click="onSend">
        发送
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { onLoad, onUnload, onShow, onHide, onBackPress, onReady } from '@dcloudio/uni-app';
import { sendPrompt, cancelSession } from '@/api/client';
import { followSession, type FollowHandle, type WsConnStatus } from '@/api/ws';
import { toBubbles, type Bubble, type AssistantPart } from '@/api/history';
import type { TokenUsage } from '@/api/types';
import { useGlobalStore } from '@/store/global';
import { KEY_COOKIE } from '@/constants';

// 阻止 uni-app 把页面 query 参数（sessionId/title）透传到根元素，避免 title 变成浏览器 tooltip
defineOptions({ inheritAttrs: false });

const sessionId = ref('');
const bubbles = ref<Bubble[]>([]);
const draft = ref('');
const sending = ref(false);
let followHandle: FollowHandle | null = null;
const global = useGlobalStore();

// —— ws 连接状态 + 断线重连 ——
const wsStatus = ref<WsConnStatus>('disconnected'); // 物理连接状态
let inBackground = false; // 是否在后台（后台保留 timer 但不重连）
let reconnectTimer: ReturnType<typeof setInterval> | null = null;

// 状态灯：绿=已连接，黄=断了但连过 token（有 cookie），红=从没连过 token
const connLight = computed(() => {
  if (wsStatus.value === 'connected') return 'green';
  if (uni.getStorageSync(KEY_COOKIE)) return 'yellow';
  return 'red';
});

const connText = computed(() => {
  if (wsStatus.value === 'connected') return '已连接';
  if (uni.getStorageSync(KEY_COOKIE)) return '已断开';
  return '未连接';
});

// —— 流式打字机状态（live 消息：流式与完成共用同一个元素） ——
interface LiveStream {
  text: string; // 累积的完整 markdown 文本
  done: boolean; // 是否已完成（完成后整段按 markdown 渲染）
  usage?: TokenUsage; // 本轮 token 用量（完成时填充）
}
const liveStream = ref<LiveStream | null>(null);

// 沉底控制
const stickToBottom = ref(true); // 是否沉底（用户上翻后变为 false）
const scrollTopValue = ref(0); // 沉底滚动用的大值（递增保证每次触发）
let scrollBottomTick = 0;
let viewHeight = 0; // scroll-view 可视高度（onReady 测量）

// 从 ContentBlock[] 提取纯文本
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('');
}

// 取气泡要显示的纯文本：用户取 text；AI 只取 text part（忽略工具/系统）
function bubbleText(b: Bubble): string {
  if (b.role === 'user') return b.text;
  return b.parts
    .filter((p): p is Extract<AssistantPart, { kind: 'text' }> => p.kind === 'text')
    .map((p) => p.text)
    .join('\n');
}

// —— 块级切分：按空行切块（代码围栏内部不切），返回已完成块数组 + 尾巴 ——
function splitStreaming(text: string): { blocks: string[]; tail: string } {
  if (!text) return { blocks: [], tail: '' };
  const lines = text.split('\n');
  const boundaries: number[] = []; // 安全空行（不在代码围栏内）的索引
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.trim() === '') boundaries.push(i);
  }
  if (boundaries.length === 0) return { blocks: [], tail: text };
  const lastBoundary = boundaries[boundaries.length - 1];
  const blocks: string[] = [];
  let start = 0;
  for (const b of boundaries) {
    const block = lines.slice(start, b).join('\n').trim();
    if (block) blocks.push(block);
    start = b + 1;
  }
  return {
    blocks,
    tail: lines.slice(lastBoundary + 1).join('\n'),
  };
}

// live 消息要渲染：已完成块（各自一个 markdown-view）+ 尾巴（纯文本）
const liveParts = computed(() => {
  const s = liveStream.value;
  if (!s) return { blocks: [] as string[], tail: '' };
  if (s.done) return { blocks: s.text.trim() ? [s.text] : [], tail: '' };
  return splitStreaming(s.text);
});

// —— 沉底滚动 ——
function onScroll(e: any) {
  const top = e.detail?.scrollTop ?? 0;
  const sh = e.detail?.scrollHeight ?? 0;
  if (viewHeight > 0 && sh > 0) {
    // 距底部 < 50px 视为沉底
    stickToBottom.value = sh - top - viewHeight < 50;
  }
}

function measureViewHeight() {
  uni
    .createSelectorQuery()
    .select('.msg-list')
    .boundingClientRect((rect: any) => {
      if (rect && rect.height > 0) viewHeight = rect.height;
    })
    .exec();
}

function scrollToBottom(force = false) {
  if (!force && !stickToBottom.value) return; // 用户上翻时不强制沉底
  nextTick(() => {
    // 设一个递增的大值：scroll-top 每次变化都会触发滚动，且被 clamp 到最底部
    scrollBottomTick += 1;
    scrollTopValue.value = 100000000 + scrollBottomTick;
  });
}

// 是否显示「回到底部」按钮（用户上滑阅读时出现）
const showScrollBtn = computed(() => !stickToBottom.value);

// 主动回到底部（用户点按钮）
function scrollToBottomNow() {
  stickToBottom.value = true;
  scrollToBottom(true);
}

// —— 气泡操作 ——
function appendAssistant(text: string, usage?: TokenUsage) {
  bubbles.value.push({
    role: 'assistant',
    seq: 0,
    time: Date.now(),
    parts: [{ kind: 'text', seq: 0, text }],
    usage,
  });
  scrollToBottom(); // 尊重用户当前滚动位置（上滑时不强制沉底）
}

// token 用量摘要（显示在 AI 消息下方）
function usageText(u?: TokenUsage): string {
  if (!u) return '';
  const parts = [`入 ${u.inputTokens}`, `出 ${u.outputTokens}`];
  if (u.cacheReadTokens) parts.push(`缓存命中 ${u.cacheReadTokens}`);
  return parts.join(' · ');
}

// 取 AI 气泡的 usage（用户气泡没有）
function bubbleUsage(b: Bubble): TokenUsage | undefined {
  return b.role === 'assistant' ? b.usage : undefined;
}

function appendUser(text: string) {
  bubbles.value.push({ role: 'user', seq: 0, time: Date.now(), text });
  scrollToBottom(true);
}

// 把上一条 live assistant 消息固化进历史（下次发消息前调用）
function commitLive() {
  if (liveStream.value) {
    const text = liveStream.value.text;
    if (text) {
      bubbles.value.push({
        role: 'assistant',
        seq: 0,
        time: Date.now(),
        parts: [{ kind: 'text', seq: 0, text }],
        usage: liveStream.value.usage,
      });
    }
    liveStream.value = null;
  }
}

// 处理 assistant-stream 帧：start / chunk / end
function handleAssistantStream(f: any) {
  if (!f) return;
  if (f.type === 'start') {
    // 仅在新回复开始时初始化；同一回复的后续 attempt 不清空已累积文本
    if (!liveStream.value) liveStream.value = { text: '', done: false };
  } else if (f.type === 'chunk') {
    const chunk = f.chunk;
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
      if (!liveStream.value) liveStream.value = { text: '', done: false };
      const atBottom = stickToBottom.value; // 追加前是否在底部
      liveStream.value.text += chunk.text;
      if (atBottom) scrollToBottom(true);
    }
    // 忽略 reasoning-delta / tool-call-delta / block-start / block-end / usage / finish
  } else if (f.type === 'end') {
    // committed 由随后的 assistant/message 事件收尾；非 committed（中止/steer）清空
    if (f.outcome?.kind !== 'committed') liveStream.value = null;
  }
}

// 等待 ws 连接成功（或超时）
function waitForConnected(timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (wsStatus.value === 'connected') {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

// 5s 定时重连：仅离开页面（onUnload）时清除；后台（onHide）保留 timer 但不触发重连
function startReconnectTimer() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(() => {
    if (inBackground) return;
    if (wsStatus.value === 'disconnected') followHandle?.reconnect();
  }, 5000);
}

function stopReconnectTimer() {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
}

function manualReconnect() {
  followHandle?.reconnect();
}

async function onSend() {
  const text = draft.value.trim();
  if (!text || !sessionId.value || sending.value) return;
  sending.value = true;
  draft.value = '';

  // 断线时先重连，成功后再发送（回复走 WebSocket，必须先确保已连）
  if (wsStatus.value === 'disconnected') {
    followHandle?.reconnect();
    const connected = await waitForConnected(3000);
    if (!connected) {
      sending.value = false;
      uni.showToast({ title: '连接失败，请重试', icon: 'none' });
      return;
    }
  }

  commitLive(); // 固化上一条 live 消息
  appendUser(text); // 乐观渲染：先显示用户消息
  const ok = await sendPrompt(sessionId.value, text);
  sending.value = false; // 发送完就恢复；回复走 WebSocket，不影响后续发送
  if (!ok) {
    uni.showToast({ title: '发送失败', icon: 'none' });
  }
}

// 是否正在流式输出（用于把「发送」按钮换成「停止」）
const isStreaming = computed(() => !!liveStream.value && !liveStream.value.done);

// 停止当前正在生成的回复
async function stop() {
  if (!sessionId.value) return;
  const ok = await cancelSession(sessionId.value);
  // 停止后 follow 流会收到 end 帧（outcome 非 committed），由 handleAssistantStream 清空 liveStream
  if (!ok) uni.showToast({ title: '停止失败', icon: 'none' });
}

onLoad((options) => {
  const sid = options?.sessionId;
  if (!sid) return;
  sessionId.value = sid;
  global.setSessionId(sid); // 记录当前会话 id：右侧菜单切换模型依赖它（新建会话直接进本页时 global.session 为空）
  const title = options?.title ? decodeURIComponent(options.title) : '会话';
  uni.setNavigationBarTitle({ title });

  // 订阅事件流：snapshot = 历史快照，event = 新事件，assistant-stream = 流式分片
  followHandle = followSession(
    sid,
    (frame: any) => {
      if (frame?.type === 'snapshot') {
        bubbles.value = toBubbles(frame.records ?? []);
        scrollToBottom(true);
      } else if (frame?.type === 'event' && frame.event?.type === 'assistant/message') {
        // 整段提交：把 live 流标为完成，仍用同一元素渲染，避免切换闪烁
        const text = textOf(frame.event?.data?.message?.content);
        const usage = frame.event?.data?.usage as TokenUsage | undefined;
        const atBottom = stickToBottom.value;
        if (liveStream.value) {
          liveStream.value = { text: text || liveStream.value.text, done: true, usage };
          if (atBottom) scrollToBottom(true);
        } else if (text) {
          appendAssistant(text, usage);
        }
      } else if (frame?.type === 'assistant-stream') {
        handleAssistantStream(frame.frame);
      } else if (frame?.type === 'event' && frame.event?.type === 'compaction/summary') {
        // 上下文压缩完成（summary 是结构化摘要，rawOutput 是文本）
        uni.showToast({ title: '上下文已压缩', icon: 'none' });
      }
    },
    () => {
      // 仅显式取消（离开页面）时回调；断线重连由 timer 驱动，不再提示
    },
    (status) => {
      wsStatus.value = status;
    },
  );

  startReconnectTimer();
});

onReady(() => {
  measureViewHeight();
});

onShow(() => {
  inBackground = false;
});

onHide(() => {
  inBackground = true; // 后台保留 timer 但不触发重连
});

onUnload(() => {
  stopReconnectTimer();
  followHandle?.cancel();
});

// 返回时稳定回到 index：清空页面栈，避免回到中间页（connect / session-create）或直接退出
onBackPress(() => {
  uni.reLaunch({ url: '/pages/index/index' });
  return true; // 阻止默认 navigateBack
});
</script>

<style scoped>
.content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 连接状态灯（顶部左侧）+ 手动重连 */
.conn-bar {
  position: fixed;
  top: 12rpx;
  left: 20rpx;
  z-index: 950;
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: rgba(255, 255, 255, 0.9);
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}

.conn-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
}
.conn-dot.green {
  background: #07c160;
}
.conn-dot.yellow {
  background: #f0ad4e;
}
.conn-dot.red {
  background: #fa5151;
}

.conn-text {
  font-size: 22rpx;
  color: #666;
}

.reconnect {
  font-size: 22rpx;
  color: #007aff;
  margin-left: 4rpx;
}

.msg-list {
  flex: 1;
  height: 0;
  padding: 24rpx;
  box-sizing: border-box;
  user-select: text;
}

.bubble {
  width: fit-content;
  width: -moz-fit-content; /* 旧版 Firefox 兼容 */
  max-width: 80%;
  padding: 20rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  word-break: break-all;
  line-height: 1.5;
  text-align: left; /* 气泡内文字左对齐，换行也不变 */
}

.bubble.user {
  margin-left: auto; /* 气泡靠右 */
  background: #007aff;
  color: #fff;
}

.bubble.assistant {
  margin-right: auto; /* 气泡靠左 */
  width: 80%; /* 固定宽度，减少流式时宽度变化导致的闪烁 */
  background: #f1f1f1;
  color: #333;
}

/* 流式尾巴：保留换行，正在输入的那一段 */
.stream-tail {
  white-space: pre-wrap;
  word-break: break-word;
}

/* token 用量摘要（AI 消息下方的小字） */
.usage-line {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  color: #999;
  user-select: text;
}

.input-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  border-top: 1rpx solid #eee;
  background: #fff;
}

.input {
  flex: 1;
  border: 1rpx solid #ddd;
  border-radius: 8rpx;
  padding: 12rpx 16rpx;
  font-size: 28rpx;
  line-height: 1.5;
  min-height: 40rpx;
  max-height: 240rpx;
  margin-right: 16rpx;
}

.send-btn {
  background: #007aff;
  color: #fff;
}

.stop-btn {
  background: #fa5151;
  color: #fff;
}

.scroll-down {
  position: fixed;
  right: 40rpx;
  bottom: 180rpx;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  color: #333;
  z-index: 900;
}
</style>
