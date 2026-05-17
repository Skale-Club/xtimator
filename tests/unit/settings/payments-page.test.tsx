import { describe, it, expect } from 'vitest'

/**
 * Wave 0 RED tests for `/settings/payments` (Plan 70-02). The page renders one
 * of three states:
 *   1. not-connected — "Connect Stripe Account" CTA button
 *   2. connected — "Connected as [display name] ([email])" + Disconnect button
 *   3. platform-not-configured — friendly message, no Connect CTA (rendered
 *      when `getIntegrationKey('stripe_connect_client_id')` returns null)
 *
 * The page is a server component that reads the company row + the platform
 * config; tests will mock both via vi.mock once the module exists.
 */

const SUT = '@/app/(app)/settings/payments/page'

describe('/settings/payments page', () => {
  it('renders the Connect CTA when company has no stripe_account_id', async () => {
    await expect(import(/* @vite-ignore */ SUT)).rejects.toThrow()
    throw new Error('Not implemented — Phase 70 plan 02')
  })

  it('renders the connected state with display name and email', async () => {
    throw new Error('Not implemented — Phase 70 plan 02')
  })

  it('renders the platform-not-configured message when client_id is unset', async () => {
    throw new Error('Not implemented — Phase 70 plan 02')
  })
})
