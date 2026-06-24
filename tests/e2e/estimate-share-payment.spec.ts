/**
 * Phase 70 — Plan 70-05: snapshot tests covering BOTH branches of the public
 * estimate share page (CONNECT-06 acceptance hard-gate).
 *
 * Scenario A — share page without Stripe Connect: the company has no
 *   stripe_account_id. Pay Now must be absent. Accept/decline path is
 *   unchanged. Snapshot baseline `share-without-stripe.png` proves the
 *   "100% optional" guarantee in CI: any future regression that surfaces
 *   Stripe UI on the unconnected branch will fail this test.
 *
 * Scenario B — share page with Stripe Connect: company has stripe_account_id
 *   and estimate.payment_status='unpaid'. Pay Now visible with the right
 *   amount, "Powered by Stripe" tagline visible. Snapshot baseline
 *   `share-with-stripe.png` proves the connected branch renders as designed.
 *
 * Scenarios C/D — `?stripe=success` and `?stripe=canceled` query states on
 *   the connected estimate: success banner appears + Pay button hidden;
 *   canceled inline message appears + Pay button retained.
 *
 * Env requirements (suite is skipped if missing):
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DB seeding)
 *   Dev server reachable at the Playwright baseURL (auto-started via config)
 *
 * Baseline snapshots are produced on first run with:
 *   npm run test:e2e -- estimate-share-payment.spec.ts --update-snapshots
 * and committed to the repo.
 */
import { test, expect } from '@playwright/test'
import {
  seedConnectEstimates,
  cleanupConnectEstimates,
  hasSeederCredentials,
} from './fixtures/connect-estimates'

let connectedToken = ''
let unconnectedToken = ''

test.describe('estimate share page — Stripe Connect both branches (CONNECT-06)', () => {
  test.beforeAll(async () => {
    test.skip(
      !hasSeederCredentials(),
      'Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run share-payment e2e'
    )
    const seeded = await seedConnectEstimates()
    connectedToken = seeded.connectedToken
    unconnectedToken = seeded.unconnectedToken
  })

  test.afterAll(async () => {
    if (hasSeederCredentials()) {
      await cleanupConnectEstimates()
    }
  })

  test('share page WITHOUT Stripe Connect renders unchanged (baseline)', async ({ page }) => {
    await page.goto(`/estimate/${unconnectedToken}`)

    // PAYGATE-02 — disconnected company shows NO forward pay surface (inventory
    // surface 3, the customer "Pay $X" button). This is naturally gated: the Pay
    // button only renders when the company is Connect-active (`paymentsEnabled`),
    // and a disconnected company can have no open invoice to pay.
    //
    // LOCKED DECISION: only forward-looking AFFORDANCES are gated. Historical
    // read-only RECORDS — a "Paid" badge on an already-paid estimate, an
    // already-issued invoice panel — are a RECORD, not an affordance, and may
    // remain when disconnected; a never-connected company simply has none.
    // Pay Now must be entirely absent on the unconnected branch.
    await expect(page.getByRole('button', { name: /Pay \$/i })).toHaveCount(0)
    await expect(page.getByText(/Powered by Stripe/i)).toHaveCount(0)

    // The pre-existing accept/decline flow remains the primary CTA pair.
    // Each test asserts the page is interactive before snapshotting so the
    // baseline can never be of a half-rendered Suspense placeholder.
    await expect(
      page.getByRole('button', { name: /accept|decline/i }).first()
    ).toBeVisible()

    await expect(page).toHaveScreenshot('share-without-stripe.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    })
  })

  test('share page WITH Stripe Connect shows Pay Now button', async ({ page }) => {
    await page.goto(`/estimate/${connectedToken}`)

    await expect(page.getByRole('button', { name: /Pay \$/i })).toBeVisible()
    await expect(page.getByText(/Powered by Stripe/i)).toBeVisible()

    await expect(page).toHaveScreenshot('share-with-stripe.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    })
  })

  test('?stripe=success shows green banner and hides Pay button', async ({ page }) => {
    await page.goto(`/estimate/${connectedToken}?stripe=success`)

    await expect(page.getByText(/Payment received/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay \$/i })).toHaveCount(0)
  })

  test('?stripe=canceled shows neutral notice and keeps Pay button', async ({ page }) => {
    await page.goto(`/estimate/${connectedToken}?stripe=canceled`)

    await expect(page.getByText(/Payment canceled/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay \$/i })).toBeVisible()
  })
})
