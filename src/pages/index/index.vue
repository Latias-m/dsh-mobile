<template>
  <view class="content">
    <image class="logo" src="/static/logo.png" />
    <side-menu />
    <side-bar />
    <view class="text-area">
      <text class="title">{{ title }}</text>
      <text class="title">{{ test }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const title = ref('Hello VUE');
const test = ref('noob');
</script>

<style>
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 200rpx;
  width: 200rpx;
  margin-top: 200rpx;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 50rpx;
}

.text-area {
  display: flex;
  justify-content: center;
}
</style>
