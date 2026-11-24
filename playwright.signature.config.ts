import { defineConfig, devices } from '@playwright/test'

// The runner supplies credentials, starts the development server separately,
// and provides Python 3 with pypdf (SIGNATURE_E2E_PYTHON overrides `python`).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'signature-launch-readiness.spec.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:9649', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
})
