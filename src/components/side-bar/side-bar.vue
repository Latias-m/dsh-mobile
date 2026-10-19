<template>
  <!-- 收起状态：可拖拽手柄（movable-view 跨端自动处理 touch/mouse） -->
  <movable-area v-if="!expanded" class="drag-area">
    <movable-view
      direction="vertical"
      class="handle"
      :y="y"
      @change="onChange"
      @click="expanded = true"
    >
      <text class="arrow">‹</text>
      <view class="dot" :class="dotClass" />
    </movable-view>
  </movable-area>

  <!-- 展开状态：遮罩 + 右侧面板 -->
  <template v-else>
    <view class="mask" @click="expanded = false" />
    <view class="panel" :style="{ top: y + 'px' }">
      <view class="panel-header" @click="expanded = false">
        <text class="arrow">›</text>
        <text class="panel-title">菜单</text>
      </view>
      <view class="panel-body">
        <button class="connect-btn" size="mini" @click="onConnect">connect</button>
      </view>
    </view>
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGlobalStore } from '../../store/global';

const global = useGlobalStore();

const expanded = ref(false);
const y = ref(200); // 初始垂直位置（px）

function onChange(e: any) {
  y.value = e.detail.y;
}

// 状态点颜色：红=未连接 黄=连接中 绿=已连接
const dotClass = computed(() => ({
  red: global.status === 'disconnected',
  yellow: global.status === 'unknow',
  green: global.status === 'connected',
}));

function onConnect() {
  expanded.value = false;
  uni.navigateTo({ url: '/pages/connect/connect' });

}
</script>

<style scoped>
.drag-area {
  position: fixed;
  right: 0;
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
  border-radius: 16rpx 0 0 16rpx;
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
  position: fixed;
  right: 0;
  width: 260rpx;
  background: #ffffff;
  border-radius: 16rpx 0 0 16rpx;
  box-shadow: -2rpx 0 10rpx rgba(0, 0, 0, 0.12);
  z-index: 1002;
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 24rpx;
  border-bottom: 1rpx solid #eee;
}

.panel-title {
  margin-left: 16rpx;
  font-size: 28rpx;
  color: #333;
}

.panel-body {
  padding: 24rpx;
}

.connect-btn {
  font-size: 26rpx;
}
</style>
