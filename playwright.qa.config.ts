import { defineConfig, devices } from '@playwright/test'
import { QA_APP_ORIGIN } from './tests/qa/fixtures/development'

const maxFailures = Number(process.env.QA_MAX_FAILURES || '0')
if (!Number.isInteger(maxFailures) || maxFailures < 0 || maxFailures > 100) throw new Error('Invalid QA_MAX_FAILURES')
const spki = process.env.XTIMATOR_QA_TLS_SPKI
if (!spki || !/^[A-Za-z0-9+/]{43}=$/.test(spki)) throw new Error('Launch QA through its per-run HTTPS campaign runner')
// Scope Chromium's certificate exception to this isolated run's generated key.
// Node API requests retain NODE_EXTRA_CA_CERTS; WebKit retains its local exception.
const chromiumTrust = { ignoreHTTPSErrors: false,
  launchOptions: { args: [`--ignore-certificate-errors-spki-list=${spki}`] } }

export default defineConfig({
  metadata: {
    testedRevision: process.env.GITHUB_SHA ?? 'local-working-tree',
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    providerMode: 'synthetic', dataEnvironment: 'development',
    nativeKeyboardNavigation: process.env.XTIMATOR_QA_FULL_KEYBOARD_NAVIGATION === '1' ? 'full' : 'host-default',
    applicationRuntime: 'compiled-standalone', publicTransport: 'loopback-https-front',
  },
  testDir: './tests/qa', testMatch: '**/*.spec.ts',
  globalSetup: './tests/qa/setup.ts', maxFailures,
  timeout: 180_000, expect: { timeout: 20_000 },
  fullyParallel: false, workers: 1, forbidOnly: true, retries: 0,
  outputDir: 'qa-results/artifacts',
  reporter: [ ['./tests/qa/reporters/privacy.mjs'], ['json', { outputFile: 'qa-results/playwright.json' }],
    ['html', { outputFolder: 'qa-results/html', open: 'never' }], ['junit', { outputFile: 'qa-results/junit.xml' }] ],
  use: { baseURL: QA_APP_ORIGIN, ignoreHTTPSErrors: true, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure', storageState: { cookies: [], origins: [] } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromiumTrust } },
    { name: 'mobile-safari', testIgnore: '**/editor-hydration.spec.ts', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chrome', testIgnore: '**/editor-hydration.spec.ts', use: { ...devices['Pixel 7'], ...chromiumTrust } },
  ],
  webServer: { command: 'node scripts/qa/start.mjs', url: `${QA_APP_ORIGIN}/api/health?quick=1`, ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 360_000 },
})
