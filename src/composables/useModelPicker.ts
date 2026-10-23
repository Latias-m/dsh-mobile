// src/composables/useModelPicker.ts
// 模型 + 思考等级选择的复用逻辑。
// 抽自 session-create.vue，供「新建会话页」和「右侧菜单（切换模型）」两处共用。
import { ref, watch } from 'vue';
import { getModelCatalog, selectModel } from '@/api/client';
import type { ModelCatalogValue, ModelEntry } from '@/api/types';

export function useModelPicker() {
  // 模型目录缓存（用于查所选模型的推理等级）
  const catalogRef = ref<ModelCatalogValue | null>(null);

  // 模型选择：下拉框选项 + 当前选中值（value 编码为 "provider::model"）
  const modelOptions = ref<Array<{ value: string; text: string }>>([]);
  const selectedModel = ref('');
  const modelLoading = ref(false);

  // 推理等级：依赖所选模型，只有带 reasoning 的模型才有选项
  const effortOptions = ref<Array<{ value: string; text: string }>>([]);
  const selectedEffort = ref('');

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

  watch(selectedModel, () => syncEffort());

  /** 把当前选择的模型 + 思考等级应用到指定会话 */
  async function applyToSession(sessionId: string): Promise<boolean> {
    const { provider, model } = findModel(selectedModel.value);
    if (!provider || !model) return false;
    const effort = selectedEffort.value || undefined;
    return selectModel(sessionId, provider, model, effort);
  }

  return {
    modelOptions,
    selectedModel,
    modelLoading,
    effortOptions,
    selectedEffort,
    loadModels,
    applyToSession,
  };
}
