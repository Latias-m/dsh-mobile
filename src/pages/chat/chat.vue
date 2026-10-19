<template>
  <view class="content">
    <side-menu />
    <side-bar />

    <!-- 消息列表 -->
    <scroll-view scroll-y class="msg-list">
      <view v-for="(b, i) in bubbles" :key="i" class="bubble" :class="b.role">
        <text>{{ bubbleText(b) }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useGlobalStore } from '@/store/global';
import { getHistory } from '@/api/client';
import { toBubbles, type Bubble, type AssistantPart } from '@/api/history';

const global = useGlobalStore();
const bubbles = ref<Bubble[]>([]);

// 取气泡要显示的纯文本：用户取 text；AI 只取 text part（忽略工具/系统）
function bubbleText(b: Bubble): string {
  if (b.role === 'user') return b.text;
  return b.parts
    .filter((p): p is Extract<AssistantPart, { kind: 'text' }> => p.kind === 'text')
    .map((p) => p.text)
    .join('\n');
}

onLoad(async () => {
  const session = global.session;
  if (!session) return; // 没有选中会话，不查历史

  uni.setNavigationBarTitle({
    title: session.projections?.values.title ?? '未命名对话',
  });

  const throughSeq = session.projections?.asOfSeq ?? 0;
  const history = await getHistory(session.sessionId, throughSeq);
  bubbles.value = toBubbles(history?.records ?? []);
});
</script>

<style scoped>
.content {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.msg-list {
  flex: 1;
  padding: 24rpx;
  box-sizing: border-box;
  user-select: text;
}

.bubble {
  max-width: 80%;
  padding: 20rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  word-break: break-all;
  line-height: 1.5;
}

.bubble.user {
  margin-left: auto; /* 靠右 */
  background: #007aff;
  color: #fff;
}

.bubble.assistant {
  margin-right: auto; /* 靠左 */
  background: #f1f1f1;
  color: #333;
}
</style>
