<template>
  <view class="content">
    <view class="field">
      <text class="label">模型</text>
      <view class="model-row">
        <view class="model-col">
          <uni-data-select
            v-model="selectedModel"
            :localdata="modelOptions"
            placeholder="选择模型"
            :clear="false"
            :disabled="modelLoading"
          />
        </view>
        <view v-if="effortOptions.length > 0" class="effort-col">
          <uni-data-select
            v-model="selectedEffort"
            :localdata="effortOptions"
            placeholder="推理等级"
            :clear="false"
          />
        </view>
      </view>
    </view>

    <view class="field">
      <text class="label">人设（agentPreset）</text>
      <uni-data-select
        v-model="selectedPreset"
        :localdata="presetOptions"
        placeholder="选择人设"
        :clear="false"
        :disabled="presetLoading"
      />
    </view>

    <view class="tips">
      <text>人设决定 AI 的工具集合与提示词。具体预设内容请在 DSH 配置，这里只选人设 id。</text>
    </view>

    <button class="btn" :disabled="creating" @click="onCreate">
      {{ creating ? '创建中…' : '创建会话' }}
    </button>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { createSession, getAgentPresets } from '@/api/client';
import { useModelPicker } from '@/composables/useModelPicker';

const creating = ref(false);
const error = ref('');

// 模型 + 思考等级选择（复用 composable）
const { modelOptions, selectedModel, modelLoading, effortOptions, selectedEffort, loadModels, applyToSession } =
  useModelPicker();

// 人设选择：下拉框选项 + 当前选中值（value = 人设 id）
const presetOptions = ref<Array<{ value: string; text: string; disable?: boolean }>>([]);
const selectedPreset = ref('');
const presetLoading = ref(false);

async function loadPresets() {
  presetLoading.value = true;
  const roster = await getAgentPresets();
  presetLoading.value = false;
  if (!roster) return;

  const options = roster.presets.map((p) => ({
    value: p.id,
    text: p.name || p.id,
    ...(p.broken ? { disable: true } : {}),
  }));
  presetOptions.value = options;
  if (options.length === 0) return;

  // 默认选中：优先 isDefault，否则第一个可用的
  const def = roster.presets.find((p) => p.isDefault && !p.broken);
  const first = options.find((o) => !o.disable);
  selectedPreset.value = def ? def.id : first ? first.value : '';
}

onMounted(() => {
  loadModels();
  loadPresets();
});

async function onCreate() {
  if (creating.value) return;
  creating.value = true;
  error.value = '';
  const preset = selectedPreset.value || undefined;
  const sessionId = await createSession(preset);
  if (!sessionId) {
    creating.value = false;
    error.value = '创建失败，请检查是否已连接 DSH';
    return;
  }

  // 创建后应用模型选择（session/create 不接收 model，需单独 selectModel）
  await applyToSession(sessionId);

  creating.value = false;
  uni.redirectTo({ url: `/pages/chat/chat?sessionId=${sessionId}` });
}
</script>

<style scoped>
.content {
  padding: 40rpx;
}
.field {
  display: flex;
  flex-direction: column;
  margin-bottom: 24rpx;
}
.label {
  font-size: 28rpx;
  color: #333;
  margin-bottom: 12rpx;
}
.model-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}
.model-col {
  flex: 1;
  min-width: 0;
}
.effort-col {
  flex-shrink: 0;
  width: 220rpx;
  margin-left: 16rpx;
}
.tips {
  margin-bottom: 32rpx;
}
.tips text {
  font-size: 24rpx;
  color: #999;
}
.btn {
  background: #007aff;
  color: #fff;
}
.error {
  color: #dd524d;
  font-size: 26rpx;
  margin-top: 16rpx;
  display: block;
  text-align: center;
}
</style>
