import { defineConfig, devices } from '@playwright/test'

// The isolation spec uses absolute URLs: the apex and demo hosts deliberately
// differ even in local development so cookie-host behavior is browser-real.
const apexOrigin = process.env.PLAYWRIGHT_APEX_ORIGIN ?? 'http://localhost:9633'
const demoAppOrigin = process.env.DEMO_APP_ORIGIN ?? 'http://demo.localhost:9633'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/globalSetup',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: apexOrigin,
    trace: 'on-first-retry',
    storageState: 'tests/e2e/fixtures/authenticated-state.json',
  },
  metadata: { apexOrigin, demoAppOrigin },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: apexOrigin,
    env: { ...process.env, DEMO_APP_ORIGIN: demoAppOrigin },
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
