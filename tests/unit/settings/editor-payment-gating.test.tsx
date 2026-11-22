import { describe, it, expect } from 'vitest'
import { resolveCompanyFeatures, type CompanyFeatureRow } from '@/lib/features/company-features'

/**
 * PAYGATE-02 — two-state proof that the owner editor's forward-looking
 * Generate-invoice affordance is gated, with no orphan when disconnected.
 *
 * The editor (`components/workspace/estimate/estimate-editor.tsx`) renders the
 * GenerateInvoiceDialog under exactly:
 *
 *     {isCurrent && paymentsEnabled && (<GenerateInvoiceDialog .../>)}
 *
 * `paymentsEnabled` is computed server-side from the company's Connect row via
 * the single `resolveCompanyFeatures(company).onlinePayments.canIssue` gate and threaded down as a prop.
 * Rendering the full editor here would require its router/context/reducer
 * machinery; instead we assert the exact gating expression that controls the
 * affordance, driven by the predicate over BOTH Connect states. This is the
 * deterministic seam — same boolean the JSX gate consumes.
 *
 * LOCKED DECISION (Open Question 2): only forward-looking AFFORDANCES are gated.
 * Historical read-only RECORDS — the "Paid" badge and the IssuedInvoicesPanel —
 * may persist when a company later disconnects; a never-connected company simply
 * has none of them (the panel returns null when empty), so nothing orphans.
 */

/** Mirrors the editor's render guard for the Generate-invoice affordance. */
function generateInvoiceAffordanceRenders(opts: {
  isCurrent: boolean
  company: CompanyFeatureRow
}): boolean {
  return opts.isCurrent && paymentsEnabled(opts.company)
}

const switchesOn = { online_payments_allowed: true, online_payments_enabled: true }

function paymentsEnabled(company: CompanyFeatureRow): boolean {
  return resolveCompanyFeatures(company, { connectPaymentsOpen: true }).onlinePayments.canIssue
}

describe('PAYGATE-02: owner editor Generate-invoice affordance gating', () => {
  const currentEstimate = { isCurrent: true }

  it('does NOT render the affordance for a disconnected company (no orphan)', () => {
    const disconnected = { ...switchesOn, stripe_account_id: 'acct_1', stripe_connect_status: 'disconnected' }
    expect(paymentsEnabled(disconnected)).toBe(false)
    expect(
      generateInvoiceAffordanceRenders({ ...currentEstimate, company: disconnected })
    ).toBe(false)
  })

  it('does NOT render the affordance for a never-connected company', () => {
    const neverConnected = { ...switchesOn, stripe_account_id: null, stripe_connect_status: null }
    expect(paymentsEnabled(neverConnected)).toBe(false)
    expect(
      generateInvoiceAffordanceRenders({ ...currentEstimate, company: neverConnected })
    ).toBe(false)
  })

  it('DOES render the affordance for an active connected company', () => {
    const active = { ...switchesOn, stripe_account_id: 'acct_1', stripe_connect_status: 'active' }
    expect(paymentsEnabled(active)).toBe(true)
    expect(
      generateInvoiceAffordanceRenders({ ...currentEstimate, company: active })
    ).toBe(true)
  })

  it('does NOT render the affordance when the platform or tenant switch is off, even when connected', () => {
    const connected = { stripe_account_id: 'acct_1', stripe_connect_status: 'active' }
    expect(paymentsEnabled({ ...connected, online_payments_allowed: false, online_payments_enabled: true })).toBe(false)
    expect(paymentsEnabled({ ...connected, online_payments_allowed: true, online_payments_enabled: false })).toBe(false)
  })

  it('never renders the affordance on a non-current (read-only) version, even when connected', () => {
    const active = { ...switchesOn, stripe_account_id: 'acct_1', stripe_connect_status: 'active' }
    expect(
      generateInvoiceAffordanceRenders({ isCurrent: false, company: active })
    ).toBe(false)
  })
})
