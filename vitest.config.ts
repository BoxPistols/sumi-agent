import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 新しい JSX 変換（React の import なしで .tsx を描画テストできるようにする）
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
