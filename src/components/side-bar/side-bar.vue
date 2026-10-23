<template>
  <!-- 收起状态：可拖拽手柄（右侧边缘） -->
  <movable-area v-if="!expanded" class="drag-area">
    <movable-view direction="vertical" class="handle" :y="y" @change="onChange" @click="openPanel">
      <text class="arrow">‹</text>
      <view class="dot" :class="dotClass" />
    </movable-view>
  </movable-area>

  <!-- 展开状态：遮罩 + 右侧设置抽屉 -->
  <template v-else>
    <view class="mask" @click="expanded = false" />
    <view class="panel">
      <view class="panel-header" @click="expanded = false">
        <text class="arrow">›</text>
        <text class="panel-title">设置</text>
      </view>

      <view class="panel-body">
        <!-- 连接状态 + 连接按钮（始终显示） -->
        <view class="status-row">
          <view class="dot" :class="dotClass" />
          <text class="status-text">{{ statusText }}</text>
        </view>
        <button class="connect-btn" size="mini" @click="onConnect">
          {{ connected ? '重新连接' : '连接 DSH' }}
        </button>

        <!-- 模型 / 思考等级切换：仅已连接且选中会话时显示（不兜底成空选项） -->
        <template v-if="canSwitchModel">
          <view class="divider" />
          <text class="section-title">模型</text>
          <uni-data-select
            v-model="selectedModel"
            :localdata="modelOptions"
            placeholder="选择模型"
            :clear="false"
            :disabled="modelLoading"
            @change="onModelChange"
          />

          <template v-if="effortOptions.length > 0">
            <text class="section-title">思考等级</text>
            <uni-data-select
              v-model="selectedEffort"
              :localdata="effortOptions"
              placeholder="推理等级"
              :clear="false"
              @change="onEffortChange"
            />
          </template>

          <view class="divider" />
          <button class="compact-btn" size="mini" @click="onCompact">压缩上下文</button>
        </template>
      </view>
    </view>
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGlobalStore } from '../../store/global';
import { useModelPicker } from '../../composables/useModelPicker';
import { compactSession } from '@/api/client';

const global = useGlobalStore();

const expanded = ref(false);
const y = ref(200); // 收起手柄的初始垂直位置（px）

const { modelOptions, selectedModel, modelLoading, effortOptions, selectedEffort, loadModels, applyToSession } =
  useModelPicker();

const connected = computed(() => global.status === 'connected');
// 当前会话 id（未选中会话时无法切换模型）
const sessionId = computed(() => global.session?.sessionId ?? '');
const canSwitchModel = computed(() => connected.value && !!sessionId.value);

function onChange(e: any) {
  y.value = e.detail.y;
}

// 状态点颜色：红=未连接 黄=未知 绿=已连接
const dotClass = computed(() => ({
  red: global.status === 'disconnected',
  yellow: global.status === 'unknow',
  green: global.status === 'connected',
}));

const statusText = computed(() => {
  if (global.status === 'connected') return '已连接';
  if (global.status === 'disconnected') return '未连接';
  return '未知';
});

function openPanel() {
  expanded.value = true;
  if (canSwitchModel.value) loadModels(); // 展开时才拉模型目录
}

function onConnect() {
  expanded.value = false;
  uni.navigateTo({ url: '/pages/connect/connect' });
}

async function onModelChange() {
  if (!sessionId.value) return;
  const ok = await applyToSession(sessionId.value);
  if (!ok) uni.showToast({ title: '切换模型失败', icon: 'none' });
}

async function onEffortChange() {
  if (!sessionId.value) return;
  const ok = await applyToSession(sessionId.value);
  if (!ok) uni.showToast({ title: '切换等级失败', icon: 'none' });
}

// 触发上下文压缩（发 /compact 指令）
async function onCompact() {
  if (!sessionId.value) return;
  expanded.value = false;
  const ok = await compactSession(sessionId.value);
  if (!ok) uni.showToast({ title: '压缩失败', icon: 'none' });
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

/* 展开面板（全高右抽屉） */
.panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100vh;
  width: 560rpx;
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
  padding: 24rpx;
  border-bottom: 1rpx solid #eee;
}

.panel-title {
  margin-left: 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.panel-body {
  padding: 24rpx;
  overflow-y: auto;
}

.status-row {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.status-row .dot {
  margin-top: 0;
  margin-right: 12rpx;
}

.status-text {
  font-size: 26rpx;
  color: #333;
}

.connect-btn {
  font-size: 26rpx;
}

.compact-btn {
  font-size: 26rpx;
  background: #f0ad4e;
  color: #fff;
}

.divider {
  height: 1rpx;
  background: #eee;
  margin: 24rpx 0;
}

.section-title {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-bottom: 12rpx;
}
</style>
