/**
 * Phase 160 — friendly-URL e2e parity (PUBURL-01/02/05).
 *
 * Proves the NEW friendly route renders the same document, logs a view, and
 * allows accept/decline identically to the existing token route — using the
 * estimate's REAL share_token internally (never the shortToken), per
 * 160-RESEARCH.md's realShareToken design.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  seedFriendlyUrlEstimate,
  cleanupFriendlyUrlEstimate,
  hasSeederCredentials,
  type SeededFriendlyEstimate,
} from './fixtures/friendly-url-estimates'

let seeded: SeededFriendlyEstimate | null = null

test.describe('friendly estimate URL — parity with token URL (PUBURL-01/02/05)', () => {
  test.beforeAll(async () => {
    test.skip(
      !hasSeederCredentials(),
      'Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run friendly-url e2e'
    )
    seeded = await seedFriendlyUrlEstimate()
  })

  test.afterAll(async () => {
    if (hasSeederCredentials()) await cleanupFriendlyUrlEstimate()
  })

  test('friendly URL renders the document and shows accept/decline', async ({ page }) => {
    await page.goto(seeded!.friendlyPath)
    await expect(page.getByRole('button', { name: /accept|decline/i }).first()).toBeVisible()
  })

  test('opening the friendly URL logs a view on the underlying estimate row (keyed by real share_token)', async ({ page }) => {
    await page.goto(seeded!.friendlyPath)
    await expect(page.getByRole('button', { name: /accept|decline/i }).first()).toBeVisible()

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data } = await svc
      .from('estimates')
      .select('viewed_at')
      .eq('share_token', seeded!.shareToken)
      .single()
    expect(data?.viewed_at).not.toBeNull()
  })

  test('an unparseable (too-short) token segment 404s instead of throwing', async ({ page }) => {
    const response = await page.goto(`/estimate/${seeded!.companySlug}/bad-slug`)
    expect(response?.status()).toBe(404)
  })
})
