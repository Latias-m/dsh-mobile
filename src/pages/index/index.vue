<template>
  <view class="content">
    <!-- 左右抽屉手柄：左=会话列表，右=设置（连接/模型/思考等级） -->
    <side-menu />
    <side-bar />

    <!-- 居中主体 -->
    <view class="hero">
      <image class="logo" src="/static/logo.png" mode="aspectFit" />
      <text class="app-name">DSH 移动端</text>
      <text class="app-subtitle">远程控制你的 DSH 智能体</text>
    </view>

    <view class="actions">
      <button class="btn btn-primary" :disabled="!connected" @click="onCreate">新建会话</button>
      <button class="btn btn-ghost" @click="onConnect">连接 DSH</button>
    </view>

    <text v-if="!connected" class="hint">未连接，请先「连接 DSH」</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useGlobalStore } from '@/store/global';

const global = useGlobalStore();
const connected = computed(() => global.status === 'connected');

function onCreate() {
  uni.navigateTo({ url: '/pages/session-create/session-create' });
}

function onConnect() {
  uni.navigateTo({ url: '/pages/connect/connect' });
}
</script>

<style scoped>
.content {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 80rpx;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 88rpx;
}

.logo {
  width: 160rpx;
  height: 160rpx;
  margin-bottom: 32rpx;
}

.app-name {
  font-size: 44rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 12rpx;
}

.app-subtitle {
  font-size: 26rpx;
  color: #999;
}

.actions {
  width: 100%;
  max-width: 600rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: 30rpx;
}

.btn-primary {
  background: #007aff;
  color: #fff;
}

.btn-primary[disabled] {
  background: #c7c7cc;
  color: #fff;
}

.btn-ghost {
  background: #fff;
  color: #007aff;
  border: 1rpx solid #007aff;
}

.hint {
  margin-top: 32rpx;
  font-size: 24rpx;
  color: #999;
}
</style>
