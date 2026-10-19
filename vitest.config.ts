// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',              // 纯 Node 环境（测纯逻辑）
    include: ['test/**/*.test.ts'],  // 只测 .test.ts 文件
  },
})