import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // The default 5s testTimeout assumes fast tests, but this suite is large
    // (450+ files) and several tests defer heavy module-graph loading into the
    // timed test body via runtime `await import(...)` — the first test in each
    // such file pays the on-demand esbuild transform + evaluation cost. Run in
    // isolation that cost is sub-second; under full-suite parallel CPU contention
    // it can exceed 5s, producing load-induced timeout flakes (not code bugs).
    // A generous shared budget removes the flake without masking real hangs
    // (a genuinely stuck test still fails well under 30s).
    testTimeout: 30_000,
    hookTimeout: 30_000,
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
