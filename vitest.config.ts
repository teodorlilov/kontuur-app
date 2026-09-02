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
    coverage: {
      provider: 'v8',
      // `text-summary` for the terminal; `lcov` because it is the format every external
      // reader wants — a Sonar instance, Codecov, or the VS Code gutter — and writing it
      // costs nothing whether or not one is ever pointed at it.
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Report on every source file, not only the ones a test happened to import. Without
      // this the percentage measures the files we remembered to test, which always looks good.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/types/**',
        // Generated or declarative-only: a coverage number for these means nothing.
        'src/**/*.d.ts',
      ],
      // Ratchets, not targets. Each sits just under what the suite covers today
      // (lib 59.4%, ai 74.3%, utils 62.8%), so the gate cannot fail on work that is
      // already done — it fails when a change drops below where we already were.
      // Raise them when a deliberate testing push moves the real number.
      //
      // Only the logic directories carry a threshold. `features/` (23%), `app/` (1.2%)
      // and `components/` (21.6%) are overwhelmingly JSX, where a coverage number
      // measures how much got rendered rather than how much was checked. Putting a
      // floor there would buy tests written to move a percentage.
      thresholds: {
        'src/lib/**': { lines: 55, statements: 55 },
        'src/ai/**': { lines: 70, statements: 70 },
        'src/utils/**': { lines: 58, statements: 58 },
      },
    },
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
