<template>
  <view class="connect">
    <view class="form">
      <text class="title">连接 DSH</text>
      <text class="label">服务器地址</text>
      <input
        v-model="url"
        class="input"
        placeholder="局域网填 http://192.168.8.219:3081，互联网填 https://xxx.trycloudflare.com"
        placeholder-class="placeholder"
        confirm-type="done"
      />

      <text class="label">登录 token</text>
      <input
        v-model="token"
        class="input"
        placeholder="粘贴 DSH 启动终端里的 token"
        placeholder-class="placeholder"
        confirm-type="done"
      />

      <button class="btn" :disabled="connecting" @click="onConnect">
        {{ connecting ? '连接中…' : '连接' }}
      </button>
      <view v-if="result" class="result">
        <text :class="result.ok ? 'ok' : 'fail'">{{ result.message }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { connect, setBaseUrl } from '../../api/client';
import { DEFAULT_BASE_URL, KEY_BASE_URL } from '../../constants';
import type { ConnectResult } from '../../api/connect/base';

const token = ref('');
const url = ref(String(uni.getStorageSync(KEY_BASE_URL) || DEFAULT_BASE_URL));
const connecting = ref(false);
const result = ref<ConnectResult | null>(null);

async function onConnect() {
  const raw = token.value.trim();
  if (!raw) {
    result.value = { ok: false, message: '请输入 token' };
    return;
  }
  const rawUrl = url.value.trim();
  if (!rawUrl) {
    result.value = { ok: false, message: '请输入服务器地址' };
    return;
  }

  // 支持两种粘贴方式：① 整行（含 token=xxx）② 纯 token
  const tokenStr = raw.match(/[?&]token=([A-Za-z0-9_-]+)/)?.[1] ?? raw;

  connecting.value = true;
  result.value = null;
  try {
    setBaseUrl(rawUrl); // 把服务器地址写进存储（auth/api/ws 全用它）
    result.value = await connect(tokenStr);
  } finally {
    connecting.value = false;
  }
}
</script>

<style scoped>
.connect {
  padding: 40rpx;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.label {
  font-size: 28rpx;
  color: #666;
}
.input {
  border: 1rpx solid #ccc;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  word-break: break-all;
  min-height: 40rpx;
}
.btn {
  margin-top: 20rpx;
}
.result {
  margin-top: 20rpx;
  user-select: text;
}
.ok {
  color: #07c160;
  font-size: 28rpx;
}
.fail {
  color: #fa5151;
  font-size: 28rpx;
}
</style>
