import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup/load-env.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'tests/integration/**/*.test.tsx',
      // Eval harness (EVAL-01/02/03). Scoped strictly to *.test.ts so the helper
      // modules (tests/eval/metrics.ts, fixtures/types.ts, fixtures/cases.ts,
      // mock-providers.ts) are NEVER collected as test suites — only *.test.ts under
      // tests/eval run. LOAD-BEARING: a `vitest run tests/eval` path arg FILTERS
      // against `include` (it does not override it); without this entry every eval
      // command silently finds "No test files found", exits 0, and runs ZERO tests,
      // which would defeat the EVAL-02/03/04 regression gate.
      'tests/eval/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    alias: {
      '@': path.resolve(__dirname, '.'),
      // server-only throws when imported from a client bundle (vitest runs jsdom = client-ish).
      // In tests we always exercise server modules in isolation, so alias to the empty stub
      // that Next.js ships for server-only (same as the react-server resolution path).
      // Find the package using Node.js module resolution (works with hoisted/monorepo node_modules).
      'server-only': require.resolve('server-only').replace(/index\.js$/, 'empty.js'),
    },
  },
})
