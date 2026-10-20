<template>
  <view class="content">
    <side-menu />
    <side-bar />

    <!-- 消息列表 -->
    <scroll-view scroll-y class="msg-list" :scroll-into-view="scrollIntoView">
      <template v-for="(b, i) in bubbles" :key="i">
        <view v-if="b.role === 'user'" :id="'msg-' + i" class="bubble" :class="b.role">
          <text>{{ bubbleText(b) }}</text>
        </view>
        <view v-if="b.role === 'assistant'" :id="'msg-' + i" class="bubble" :class="b.role">
          <markdown-view :text="bubbleText(b)" />
        </view>
      </template>
    </scroll-view>

    <!-- 输入框 -->
    <view class="input-bar">
      <input
        v-model="draft"
        class="input"
        placeholder="输入消息…"
        confirm-type="send"
        :disabled="!sessionId"
        @confirm="onSend"
      />
      <button class="send-btn" size="mini" :disabled="!sessionId || sending" @click="onSend">
        发送
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { onLoad, onUnload, onBackPress } from '@dcloudio/uni-app';
import { sendPrompt } from '@/api/client';
import { followSession } from '@/api/ws';
import { toBubbles, type Bubble, type AssistantPart } from '@/api/history';

// 阻止 uni-app 把页面 query 参数（sessionId/title）透传到根元素，避免 title 变成浏览器 tooltip
defineOptions({ inheritAttrs: false });

const sessionId = ref('');
const bubbles = ref<Bubble[]>([]);
const draft = ref('');
const sending = ref(false);
const scrollIntoView = ref('');
let cancelFollow: (() => void) | null = null;

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

function scrollToBottom() {
  nextTick(() => {
    scrollIntoView.value = 'msg-' + (bubbles.value.length - 1);
  });
}

function appendAssistant(text: string) {
  bubbles.value.push({
    role: 'assistant',
    seq: 0,
    time: Date.now(),
    parts: [{ kind: 'text', seq: 0, text }],
  });
  scrollToBottom();
}

function appendUser(text: string) {
  bubbles.value.push({ role: 'user', seq: 0, time: Date.now(), text });
  scrollToBottom();
}

async function onSend() {
  const text = draft.value.trim();
  if (!text || !sessionId.value || sending.value) return;
  sending.value = true;
  draft.value = '';
  appendUser(text); // 乐观渲染：先显示用户消息
  const ok = await sendPrompt(sessionId.value, text);
  sending.value = false; // 发送完就恢复；回复走 WebSocket，不影响后续发送
  if (!ok) {
    uni.showToast({ title: '发送失败', icon: 'none' });
  }
}

onLoad((options) => {
  const sid = options?.sessionId;
  if (!sid) return;
  sessionId.value = sid;
  const title = options?.title ? decodeURIComponent(options.title) : '会话';
  uni.setNavigationBarTitle({ title });

  // 订阅事件流：snapshot = 历史快照，event = 实时新事件
  cancelFollow = followSession(
    sid,
    (frame: any) => {
      if (frame?.type === 'snapshot') {
        bubbles.value = toBubbles(frame.records ?? []);
        scrollToBottom();
      } else if (frame?.type === 'event' && frame.event?.type === 'assistant/message') {
        // 整段输出：收到完整 assistant/message 时追加 AI 气泡
        const text = textOf(frame.event?.data?.message?.content);
        if (text) appendAssistant(text);
      }
    },
    () => {
      // 流结束（end/error/close）。长连接断开后暂无自动重连，仅提示一次。
      if (sessionId.value) uni.showToast({ title: '连接已断开', icon: 'none' });
    }
  );
});

onUnload(() => {
  cancelFollow?.();
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
  background: #f1f1f1;
  color: #333;
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
  margin-right: 16rpx;
}

.send-btn {
  background: #007aff;
  color: #fff;
}
</style>
