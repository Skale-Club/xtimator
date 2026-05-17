import { describe, it, expect } from 'vitest'

/**
 * Wave 0 RED tests for the OAuth callback route (`/api/stripe/connect/callback`)
 * shipped in Plan 70-02. The callback exchanges the `code` query param for a
 * `stripe_user_id`, persists it on the company row, and redirects back to
 * `/settings/payments`.
 *
 * Critical invariants verified here:
 *   - Happy path: valid state + code → POST to `connect.stripe.com/oauth/token`
 *     → `companies.stripe_account_id` populated.
 *   - Idempotency: if a company already has `stripe_account_id` set, the
 *     callback MUST NOT re-exchange the code (OAuth codes are single-use; a
 *     second exchange revokes the connection per OAuth 2 spec).
 *   - State CSRF: tampered/missing state → 400 response, no code exchange.
 */

// Dynamic, non-statically-analyzable import path so Vite defers resolution to
// runtime — this lets each test fail with a meaningful "not implemented" error
// instead of a transform-time crash.
const SUT = '@/app/api/stripe/connect/callback/route'

describe('stripe connect OAuth callback', () => {
  it('persists stripe_account_id on happy-path code exchange', async () => {
    // SUT not implemented until Plan 70-02. Importing the route module should
    // throw because the file does not yet exist.
    await expect(import(/* @vite-ignore */ SUT)).rejects.toThrow()
    throw new Error('Not implemented — Phase 70 plan 02')
  })

  it('is idempotent when callback runs for an already-connected company', async () => {
    // Plan 70-02 must check `companies.stripe_account_id` BEFORE calling
    // `fetch(connect.stripe.com/oauth/token)` and short-circuit if already set.
    throw new Error('Not implemented — Phase 70 plan 02')
  })

  it('rejects requests with an invalid state with HTTP 400', async () => {
    // Tampered or missing state → no token exchange, response.status === 400.
    throw new Error('Not implemented — Phase 70 plan 02')
  })
})
