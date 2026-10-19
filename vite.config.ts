import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// DSH 局域网地址（按你电脑实际 IP 改）
const DSH_TARGET = "http://192.168.8.219:3080";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  server: {
    proxy: {
      // API 请求：H5 里请求 /api/xxx → 转发到 DSH /api/xxx
      "/api": {
        target: DSH_TARGET,
        changeOrigin: false, // 保持 Host，让 cookie 的 authority 与浏览器看到的 origin 一致
      },
      // token 交换：H5 里请求 /auth?token=xxx → 转发到 DSH /?token=xxx
      "/auth": {
        target: DSH_TARGET,
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/auth/, ""),
      },
    },
  },
});
