import { defineConfig } from '@playwright/test'

// Worker-module compatibility only: no app, browser fixture or credentials.
export default defineConfig({
  testDir: './tests/qa-loader', testMatch: '**/*.spec.ts',
  workers: 1, retries: 0, timeout: 30_000, forbidOnly: true,
  reporter: [['./tests/qa/reporters/privacy.mjs']],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
})
