<template>
  <!-- 收起状态：可拖拽手柄（movable-view 跨端自动处理 touch/mouse） -->
  <movable-area v-if="!expanded" class="drag-area">
    <movable-view direction="vertical" class="handle" :y="y" @change="onChange" @click="openMenu">
      <text class="arrow">></text>
    </movable-view>
  </movable-area>

  <!-- 展开状态：遮罩 + 左侧面板 -->
  <template v-else>
    <view class="mask" @click="expanded = false" />
    <view class="panel" :style="{ width: menuWidth + 'px' }">
      <view class="panel-header">
        <view class="header-title" @click="expanded = false">
          <text class="arrow"><</text>
          <text class="panel-title">会话</text>
        </view>
        <text v-if="connected" class="add-btn" @click="onAddSession">＋</text>
        <view
          class="resize-handle"
          @touchstart="onResizeStart"
          @touchmove.prevent="onResizeMove"
          @touchend="onResizeEnd"
          @touchcancel="onResizeEnd"
          @mousedown="onResizeStart"
          @mousemove.prevent="onResizeMove"
          @mouseup="onResizeEnd"
          @mouseleave="onResizeEnd"
        />
      </view>
      <view class="panel-body">
        <!-- 未连接：不兜底成空列表，给明确引导 -->
        <view v-if="!connected" class="empty-tip">
          <text class="empty-text">未连接 DSH</text>
          <button class="connect-btn" size="mini" @click="onGoConnect">去连接</button>
        </view>
        <scroll-view v-else scroll-y class="list">
          <view
            v-for="item in sessions"
            :key="item.sessionId"
            class="session-item"
            @click="onSelect(item)"
          >
            <view class="line" hover-class="line-active" hover-start-time="0" hover-stay-time="100">
              <view class="line-main">
                <view v-if="item.running" class="running-dot" />
                <text class="line-val"
                  >{{ item.projections?.values.title ?? '(未命名)'
                  }}<text v-if="item.blank" class="blank">空</text></text
                >
              </view>

              <text class="time">{{ $formatTime(item.updatedAt) }}</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGlobalStore } from '../../store/global';
import { getList } from '@/api/client';
import type { SessionListItem } from '@/api/types';

const global = useGlobalStore();

const expanded = ref(false);
// 是否已连接：未连接时不展示会话列表（不兜底成空列表）
const connected = computed(() => global.status === 'connected');
const sessions = ref<SessionListItem[]>([]);
const y = ref(200); // 初始垂直位置（px）
const menuWidth = ref(300); // 面板宽度（px）

function onChange(e: any) {
  y.value = e.detail.y;
}

// 拖拽调整面板宽度
let resizeStartX = 0;
let resizeStartWidth = 0;

function getClientX(e: any): number {
  return e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
}

let resizeDragging = false;

function onResizeStart(e: any) {
  resizeDragging = true;
  resizeStartX = getClientX(e);
  resizeStartWidth = menuWidth.value;
}

function onResizeMove(e: any) {
  if (!resizeDragging) return;
  const dx = getClientX(e) - resizeStartX;
  menuWidth.value = Math.max(200, Math.min(600, resizeStartWidth + dx));
}

function onResizeEnd() {
  resizeDragging = false;
}

async function openMenu() {
  expanded.value = true;
  if (!connected.value) return; // 未连接：不拉列表，交给「去连接」引导
  const list: SessionListItem[] = await getList();
  sessions.value = list;
}

function onGoConnect() {
  expanded.value = false;
  uni.navigateTo({ url: '/pages/connect/connect' });
}

function onSelect(e: SessionListItem) {
  global.setSession(e);
  const title = encodeURIComponent(e.projections?.values.title ?? '');
  uni.navigateTo({ url: `/pages/chat/chat?sessionId=${e.sessionId}&title=${title}` });
  expanded.value = false;
}

function onAddSession() {
  uni.navigateTo({ url: '/pages/session-create/session-create' });
}
</script>

<style lang="scss" scoped>
.drag-area {
  position: fixed;
  left: 0;
  top: 25vh;
  width: 24rpx;
  height: 50vh;
  z-index: 1000;
}

/* 遮罩层 */
.mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1001;
}

/* 收起手柄 */
.handle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 25rpx;
  height: 60rpx;
  background: #ffffff;
  border-radius: 0 8rpx 8rpx 0;
  box-shadow: -2rpx 0 10rpx rgba(0, 0, 0, 0.12);
}

.arrow {
  font-size: 15rpx;
  color: #333;
  line-height: 1;
}

.dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  margin-top: 16rpx;
}
.dot.red {
  background: #fa5151;
}
.dot.yellow {
  background: #f0ad4e;
}
.dot.green {
  background: #07c160;
}

/* 展开面板 */
.panel {
  top: 0;
  position: fixed;
  left: 0;
  height: 100vh;
  background: #ffffff;
  border-radius: 0 16rpx 16rpx 0;
  box-shadow: -2rpx 0 10rpx rgba(0, 0, 0, 0.12);
  z-index: 1002;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 0;
  border-bottom: 1rpx solid #eee;
}

.header-title {
  display: flex;
  align-items: center;
  padding: 24rpx;
}

.panel-title {
  margin-left: 16rpx;
  font-size: 28rpx;
  color: #333;
}

.add-btn {
  margin-left: auto;
  padding: 0 20rpx;
  font-size: 44rpx;
  line-height: 1;
  color: #007aff;
}

.panel-body {
  flex: 1;
  height: 0;
}
.list {
  height: 100%;
}

.resize-handle {
  align-self: stretch;
  width: 32rpx;
  cursor: ew-resize;
  border-left: 1rpx solid #eee;
}

.connect-btn {
  font-size: 26rpx;
}

.empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 20rpx;
}

.empty-text {
  font-size: 26rpx;
  color: #999;
}

.line {
  display: flex;
  justify-content: space-between;
  padding: 7px 10px;
}

.line.line-active {
  background: $uni-bg-color-hover;
}

.line > * {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.time {
  color: $uni-text-color-grey;
}
.line-val {
  width: 0;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.line-main {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.running-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #07c160;
  margin-right: 8rpx;
  flex-shrink: 0;
}
</style>
