// Wave 0 scaffold — RED until Phase 18 plan 03 implements full pipeline + e2e wiring.
// This test turns GREEN in Phase 18 plan 03 task 3 (finalize e2e + phase gate).
// Covers P18-07 (auto-fire generation + redirect to editor with populated draft).

import { test, expect } from '@playwright/test'

test.describe('voice-first flow (P18-07)', () => {
  test.skip(true, 'Wave 0 scaffold — full pipeline requires authenticated session + real API keys. Activated in Phase 18 plan 03 task 3.')

  test('after recording, user lands on estimate editor with populated draft', async ({ page }) => {
    // Full pipeline: wizard client pick → eager project create → /capture → record → transcribe → AI estimate → /projects/[id]?tab=estimate
    // Requires: NEXT_PUBLIC_SUPABASE_URL, authenticated session, OpenAI Whisper key, Anthropic key.
    // Set E2E_FULL_PIPELINE=1 to enable real API calls.

    // 1. Navigate to new project wizard
    await page.goto('/projects/new')

    // 2. Select a client (seeded test client)
    // (implementation details land in Phase 18 plan 03 task 3)

    // 3. Submit wizard — should redirect to /projects/[id]/capture
    // 4. On capture screen, start recording
    // 5. Stop recording — pipeline fires automatically
    // 6. Assert redirect to /projects/[id]?tab=estimate with populated estimate

    await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+\?tab=estimate/)
    await expect(page.locator('[data-testid="estimate-editor"]')).toBeVisible()
  })
})
