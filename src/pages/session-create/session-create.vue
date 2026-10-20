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
import { ref, watch, onMounted } from 'vue';
import { createSession, getModelCatalog, selectModel, getAgentPresets } from '@/api/client';
import type { ModelCatalogValue, ModelEntry } from '@/api/types';

const creating = ref(false);
const error = ref('');

// 模型目录缓存（用于查所选模型的推理等级）
const catalogRef = ref<ModelCatalogValue | null>(null);

// 模型选择：下拉框选项 + 当前选中值（value 编码为 "provider::model"）
const modelOptions = ref<Array<{ value: string; text: string }>>([]);
const selectedModel = ref('');
const modelLoading = ref(false);

// 推理等级：依赖所选模型，只有带 reasoning 的模型才有选项
const effortOptions = ref<Array<{ value: string; text: string }>>([]);
const selectedEffort = ref('');

// 人设选择：下拉框选项 + 当前选中值（value = 人设 id）
const presetOptions = ref<Array<{ value: string; text: string; disable?: boolean }>>([]);
const selectedPreset = ref('');
const presetLoading = ref(false);

/** 解析 "provider::model"，并找到对应模型条目 */
function findModel(value: string): { provider: string; model: string; entry?: ModelEntry } {
  const sep = value.indexOf('::');
  if (sep <= 0) return { provider: '', model: '' };
  const provider = value.slice(0, sep);
  const model = value.slice(sep + 2);
  const group = catalogRef.value?.groups.find((g) => g.id === provider);
  const entry = group?.models.find((m) => m.id === model);
  return { provider, model, entry };
}

/** 根据所选模型刷新推理等级选项 */
function syncEffort() {
  const { entry } = findModel(selectedModel.value);
  const reasoning = entry?.reasoning;
  if (reasoning && reasoning.efforts.length > 0) {
    effortOptions.value = reasoning.efforts.map((e) => ({ value: e.id, text: e.name || e.id }));
    const def = reasoning.defaultEffort;
    if (def && effortOptions.value.some((o) => o.value === def)) {
      selectedEffort.value = def;
    } else {
      selectedEffort.value = effortOptions.value[0].value;
    }
  } else {
    effortOptions.value = [];
    selectedEffort.value = '';
  }
}

async function loadModels() {
  modelLoading.value = true;
  const catalog = await getModelCatalog();
  modelLoading.value = false;
  if (!catalog) return;
  catalogRef.value = catalog;

  const options: Array<{ value: string; text: string }> = [];
  for (const group of catalog.groups) {
    for (const m of group.models) {
      options.push({
        value: `${group.id}::${m.id}`,
        text: `${group.name} · ${m.name}`,
      });
    }
  }
  modelOptions.value = options;
  if (options.length === 0) return;

  // 默认选中：优先 catalog.default，否则第一个
  const def = catalog.default;
  const defValue = def && def.provider && def.model ? `${def.provider}::${def.model}` : '';
  if (defValue && options.some((o) => o.value === defValue)) {
    selectedModel.value = defValue;
  } else {
    selectedModel.value = options[0].value;
  }
  syncEffort();
}

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

watch(selectedModel, () => syncEffort());

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
  const { provider, model } = findModel(selectedModel.value);
  if (provider && model) {
    const effort = selectedEffort.value || undefined;
    await selectModel(sessionId, provider, model, effort);
  }

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
