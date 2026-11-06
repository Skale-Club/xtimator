import 'server-only'
import {
  assertCanCreate,
  assertCanEdit,
  getAccessState,
  type BillingBlockCode,
} from '@/lib/billing/access-state'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { formatUsd } from '@/lib/billing/format-usd'
import { getEstimatedCredits } from '@/lib/billing/estimated-credits'
import type { EstimatedCreditOp } from '@/lib/billing/estimated-credit-ops'

/**
 * SEED-055 Phase D: adapters that turn the access-state gates into the
 * `{ error, code }` shape server actions already return, so a UI can react to
 * the machine code. Both are inert (return null) while enforcement is OFF and
 * FAIL OPEN on any infrastructure error: a billing-read hiccup must never take
 * the app down (the AI routes' credit check keeps its own hard gate).
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

/** Gate for creating something (estimate, project, client, AI-backed op). */
export async function billingCreateDenied(
  companyId: string | null | undefined,
  op: EstimatedCreditOp = 'estimate'
): Promise<BillingDenied | null> {
  if (!companyId) return null
  try {
    const res = await assertCanCreate(companyId, await getEstimatedCredits(op))
    return res.ok ? null : denied(res.code)
  } catch (err) {
    console.warn('[billing] create gate failed open:', err)
    return null
  }
}

/** Gate for editing existing data: refused only while paywalled (read-only app). */
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
 * `paywalled` when it cannot be determined.
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
  | { state: BillingBlockCode; priceLabel: string }

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
