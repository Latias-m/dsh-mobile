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
          <text class="panel-title">菜单</text>
        </view>
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
        <scroll-view scroll-y class="list">
          <view
            v-for="item in sessions"
            :key="item.sessionId"
            class="session-item"
            @click="onSelect(item)"
          >
            <view class="line" hover-class="line-active" hover-start-time="0" hover-stay-time="100">
              <text class="line-val"
                >{{ item.projections?.values.title ?? '(未命名)'
                }}<text v-if="item.blank" class="blank">空</text></text
              >

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
  const list: SessionListItem[] = await getList();
  sessions.value = list;
}

function onSelect(e: SessionListItem) {
  console.log(e.sessionId);
  global.setSession(e);
  uni.navigateTo({ url: '/pages/chat/chat' });
  expanded.value = false;
}
</script>

<style lang="scss" scoped>
.drag-area {
  position: fixed;
  left: 0;
  top: 25vh;
  width: 64rpx;
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
  width: 64rpx;
  height: 120rpx;
  background: #ffffff;
  border-radius: 0 16rpx 16rpx 0;
  box-shadow: -2rpx 0 10rpx rgba(0, 0, 0, 0.12);
}

.arrow {
  font-size: 32rpx;
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
  border-radius: 16rpx 0 0 16rpx;
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

.panel-body {
  flex: 1;
  height: 0;
}
.list {
  height: 100%;
}

.resize-handle {
  margin-left: auto;
  align-self: stretch;
  width: 32rpx;
  cursor: ew-resize;
  border-left: 1rpx solid #eee;
}

.connect-btn {
  font-size: 26rpx;
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
}
</style>
