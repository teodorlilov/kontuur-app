import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Next resolves `server-only` itself; vitest does not, and the guard's job
      // is to fail a client bundle, which vitest never builds.
      'server-only': path.resolve(__dirname, 'src/test/server-only-stub.ts'),
    },
  },
})
