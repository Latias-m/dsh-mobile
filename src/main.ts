import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  // 全局注册，模板里用 {{ $formatTime(x) }}
  app.config.globalProperties.$formatTime = (ts: number): string => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return '刚刚';
    if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
    if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  return {
    app,
  };
}
