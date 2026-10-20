// mp-html 相关类型声明
// - mp-html.vue 由 env.d.ts 的 `*.vue` 通配兜底
// - marked.min.js 没有类型，这里补一个宽松声明
declare module 'mp-html/plugins/markdown/marked.min.js' {
  export const marked: {
    (src: string, options?: Record<string, any>): string;
    parse: (src: string, options?: Record<string, any>) => string;
  };
}
