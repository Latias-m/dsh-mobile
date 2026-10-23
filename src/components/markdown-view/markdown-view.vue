<template>
  <mp-html
    :content="html"
    :selectable="true"
    :container-style="containerStyle"
    :tag-style="tagStyle"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MpHtml from 'mp-html/dist/uni-app/components/mp-html/mp-html.vue';
import MarkdownIt from 'markdown-it';

const props = defineProps<{ text: string }>();

// ES5 兼容的 markdown 解析器（markdown-it 不用 Unicode 属性转义，App 端 WebView 可解析）
const md = new MarkdownIt({
  html: false, // 关闭 raw HTML，防 XSS
  linkify: true, // 自动识别链接
});

// markdown → html（解析失败时回退为纯文本，避免白屏）
const html = computed<string>(() => {
  if (!props.text) return '';
  try {
    return md.render(props.text);
  } catch {
    return props.text;
  }
});

// 根容器样式：深色文字、行高 1.6，跟 assistant 气泡一致
const containerStyle = 'font-size: 15px; line-height: 1.6; color: #333; word-break: break-word;';

// 各标签默认样式（px 单位跨端稳定；配色对齐浅灰气泡）
const tagStyle: Record<string, string> = {
  p: 'margin: 0 0 6px 0;',
  h1: 'font-size: 20px; font-weight: bold; margin: 12px 0 8px;',
  h2: 'font-size: 18px; font-weight: bold; margin: 10px 0 8px;',
  h3: 'font-size: 17px; font-weight: bold; margin: 8px 0 6px;',
  h4: 'font-size: 16px; font-weight: bold; margin: 6px 0 4px;',
  h5: 'font-size: 15px; font-weight: bold; margin: 4px 0 2px;',
  h6: 'font-size: 15px; font-weight: bold; margin: 4px 0 2px;',
  ul: 'margin: 4px 0; padding-left: 20px;',
  ol: 'margin: 4px 0; padding-left: 20px;',
  li: 'margin: 2px 0;',
  blockquote: 'margin: 8px 0; padding: 6px 12px; border-left: 3px solid #d8d8d8; background: rgba(0,0,0,0.03); color: #666;',
  code: 'font-family: monospace; font-size: 13px;',
  pre: 'margin: 8px 0; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 6px; overflow: auto;',
  a: 'color: #007aff; text-decoration: none;',
  hr: 'margin: 12px 0; border: none; border-top: 1px solid #e0e0e0;',
  table: 'border-collapse: collapse; margin: 8px 0; width: 100%;',
  th: 'border: 1px solid #ddd; padding: 4px 8px; background: rgba(0,0,0,0.04); font-weight: bold;',
  td: 'border: 1px solid #ddd; padding: 4px 8px;',
  img: 'max-width: 100%; height: auto; border-radius: 6px;',
};
</script>
