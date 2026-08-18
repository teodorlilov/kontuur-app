import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const alias = {
  '@': path.resolve(__dirname, 'src'),
  // Next resolves `server-only` itself; vitest does not, and the guard's job
  // is to fail a client bundle, which vitest never builds.
  'server-only': path.resolve(__dirname, 'src/test/server-only-stub.ts'),
}

/**
 * Two projects, because the environments have very different costs.
 *
 * The node project is 1,200+ tests in ~2s and covers pure logic, which is where most
 * behaviour in this codebase deliberately lives. Giving all of it a DOM would slow every
 * run to buy nothing — none of those tests render.
 *
 * The jsdom project is component tests, matched by `*.test.tsx`. The extension IS the
 * selector: a test that renders needs a DOM, and one that does not should not pay for it.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'components',
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup-components.ts'],
        },
      },
    ],
  },
})
