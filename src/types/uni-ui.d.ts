// 声明 easycom 引入的 uni-ui 组件，避免 vue-tsc 报「未知组件」
// uni-ui 不提供类型声明，这里用宽松类型兜底；具体样式/逻辑在组件内部处理
import type { DefineComponent } from 'vue'

declare module '@vue/runtime-core' {
  export interface GlobalComponents {
    'uni-data-select': DefineComponent<Record<string, any>, Record<string, any>, any>
  }
}
