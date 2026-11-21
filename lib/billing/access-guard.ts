import 'server-only'
import { assertCanCreate, assertCanEdit, getAccessState } from '@/lib/billing/access-state'
import type { BillingBlockCode, BillingWallCode } from '@/lib/billing/block-codes'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { formatUsd } from '@/lib/billing/format-usd'
import { getEstimatedCredits } from '@/lib/billing/estimated-credits'
import type { EstimatedCreditOp } from '@/lib/billing/estimated-credit-ops'

/**
 * SEED-055 Phase D: adapters that turn the access-state gates into the
 * `{ error, code }` shape server actions already return, so a UI can react to
 * the machine code. Both are inert (return null) while enforcement is OFF.
 *
 * Failure policy (owner decision): FAIL CLOSED wherever paid AI would run, FAIL
 * OPEN where nothing paid runs. billingCreateDenied is closed by default (every
 * EstimatedCreditOp is an AI-spending op); a caller that creates something
 * without AI (a draft project) opts out with `{ failOpen: true }`. The edit
 * gate and the display contexts (paywall banner, capture screen) stay open: a
 * billing-read hiccup must never lock a customer out of the app or its pages.
 */
export type BillingDenied = {
  error: string
  code: BillingBlockCode
  // Optional-undefined members keep this assignable into the data / conflict
  // discriminated unions the actions' callers already narrow on.
  data?: undefined
  conflict?: undefined
}

export const BILLING_BLOCK_MESSAGES: Record<BillingBlockCode, string> = {
  paywalled: 'Your free credits are used up. Subscribe to Xtimator Pro to keep working.',
  out_of_credits: "You're out of credits. Buy credits to create new estimates.",
  unavailable: "We couldn't check your account right now. Please try again.",
}

/**
 * Thrown by service-layer entry points (no `{ error }` shape to return) when the
 * company may not create. Carries the machine code.
 */
export class BillingBlockedError extends Error {
  readonly code: BillingBlockCode
  constructor(code: BillingBlockCode) {
    super(BILLING_BLOCK_MESSAGES[code])
    this.name = 'BillingBlockedError'
    this.code = code
  }
}

function denied(code: BillingBlockCode): BillingDenied {
  return { error: BILLING_BLOCK_MESSAGES[code], code }
}

/**
 * Gate for creating something (estimate, AI-backed op, or a draft project).
 *
 * When the balance cannot be read this returns denied('unavailable') (fail
 * closed), because every EstimatedCreditOp spends AI. A caller whose action runs
 * no AI passes { failOpen: true } to keep the old behaviour (allow).
 */
export async function billingCreateDenied(
  companyId: string | null | undefined,
  op: EstimatedCreditOp = 'estimate',
  opts?: { failOpen?: boolean }
): Promise<BillingDenied | null> {
  if (!companyId) return null
  try {
    const res = await assertCanCreate(companyId, await getEstimatedCredits(op))
    return res.ok ? null : denied(res.code)
  } catch (err) {
    if (opts?.failOpen) {
      console.warn('[billing] create gate failed open (no AI runs here):', err)
      return null
    }
    console.warn('[billing] create gate failed closed:', err)
    return denied('unavailable')
  }
}

/**
 * Gate for editing existing data: refused only while paywalled (read-only app).
 * Fails OPEN by design: an edit runs no paid AI, so a billing-read hiccup must
 * not freeze the customer's own data.
 */
export async function billingEditDenied(
  companyId: string | null | undefined
): Promise<BillingDenied | null> {
  if (!companyId) return null
  try {
    const res = await assertCanEdit(companyId)
    return res.ok ? null : denied(res.code)
  } catch (err) {
    console.warn('[billing] edit gate failed open:', err)
    return null
  }
}

/**
 * Which wall a credit-blocked caller hit, for the `state` field of the 402
 * bodies (UpgradeModal picks "Subscribe" vs "Buy credits" from it). Resolves to
 * `paywalled` when the gate now says "allowed" (a race with a top-up), and to
 * `unavailable` when the balance cannot be read: callers then answer a
 * retryable 503 / plain error instead of a 402 paywall.
 */
export async function creditBlockState(
  companyId: string | null | undefined,
  op: EstimatedCreditOp = 'estimate'
): Promise<BillingBlockCode> {
  const d = await billingCreateDenied(companyId, op)
  return d?.code ?? 'paywalled'
}

export type PaywallContext =
  | { state: 'active' }
  | { state: BillingWallCode; priceLabel: string }

/**
 * What the two layouts ((app) banner, (capture) full-screen block) need to
 * render the paywall: the access state plus the Pro monthly price label taken
 * from billing_config. Fails open to `active` - a billing-read hiccup must
 * never lock a customer out of the app shell.
 */
export async function getPaywallContext(companyId: string): Promise<PaywallContext> {
  try {
    const access = await getAccessState(companyId)
    if (access.state === 'active') return { state: 'active' }
    const cfg = await getBillingConfig()
    return {
      state: access.state,
      priceLabel: formatUsd(cfg.tiers.pro.subscriptionPriceCents),
    }
  } catch (err) {
    console.warn('[billing] paywall context failed open:', err)
    return { state: 'active' }
  }
}

/**
 * Credit recalibration 2026-11-19: what the (capture) layout renders. Capture
 * only exists to start a new estimate, so it shows the block screen not just
 * when the app is paywalled but also when the spendable balance is below the
 * estimate's entry gate (a free account with 40 credits left cannot start one).
 * Fails open to `active`, like getPaywallContext.
 */
export async function getCaptureGateContext(companyId: string): Promise<PaywallContext> {
  const paywall = await getPaywallContext(companyId)
  if (paywall.state !== 'active') return paywall
  try {
    // Display only (nothing paid runs while the screen renders): fail open.
    const denied = await billingCreateDenied(companyId, 'estimate', { failOpen: true })
    if (!denied || denied.code === 'unavailable') return { state: 'active' }
    const cfg = await getBillingConfig()
    return { state: denied.code, priceLabel: formatUsd(cfg.tiers.pro.subscriptionPriceCents) }
  } catch (err) {
    console.warn('[billing] capture gate context failed open:', err)
    return { state: 'active' }
  }
}
