import { defineConfig, devices } from '@playwright/test'

const maxFailures = Number(process.env.QA_MAX_FAILURES || '0')
if (!Number.isInteger(maxFailures) || maxFailures < 0 || maxFailures > 100) throw new Error('Invalid QA_MAX_FAILURES')

export default defineConfig({
  testDir: './tests/qa', testMatch: '**/*.spec.ts',
  globalSetup: './tests/qa/setup.ts', maxFailures,
  timeout: 180_000, expect: { timeout: 20_000 },
  fullyParallel: false, workers: 1, forbidOnly: true, retries: 0,
  outputDir: 'qa-results/artifacts',
  reporter: [ ['list'], ['json', { outputFile: 'qa-results/playwright.json' }],
    ['html', { outputFolder: 'qa-results/html', open: 'never' }], ['junit', { outputFile: 'qa-results/junit.xml' }] ],
  use: { baseURL: 'http://127.0.0.1:9650', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure', storageState: { cookies: [], origins: [] } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', testIgnore: '**/editor-hydration.spec.ts', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chrome', testIgnore: '**/editor-hydration.spec.ts', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'node scripts/qa/start.mjs', url: 'http://127.0.0.1:9650/api/health?quick=1', reuseExistingServer: false, timeout: 180_000 },
})
