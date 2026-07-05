import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { getBillingConfig } from '@/lib/billing/billing-config'

/**
 * Phase 153 (CREDITUI-07) — off-session auto-top-up orchestration CORE.
 *
 * Never-throw, best-effort — mirrors lib/billing/credit-ledger.ts's shape
 * exactly, because this module is called (via `void`, fire-and-forget) from
 * INSIDE recordCreditDebit's hot path. A Stripe error, a DB lock-acquisition
 * miss, or a network blip here must never propagate into the credit-debit
 * call that triggered it.
 *
 * Concurrency safety (the single riskiest property in this phase): two
 * debits crossing the threshold near-simultaneously must result in AT MOST
 * ONE off-session charge. Defense in depth via TWO independent mechanisms:
 *   1. acquireAutoTopupLock — an atomic Postgres UPDATE (via RPC, sidestepping
 *      supabase-js compound-filter chaining ambiguity) that only ONE
 *      concurrent caller can win. Fails CLOSED: any lock-acquisition error
 *      or "already held" response skips the charge — ambiguity never favors
 *      charging twice.
 *   2. Stripe's native idempotencyKey (request option, NOT a body field) —
 *      guards against a retried Stripe API call double-firing the SAME
 *      logical attempt, complementing (not replacing) the DB-level lock.
 */

/** Atomic acquire — true iff this call won the lock. Fails CLOSED on any error. */
export async function acquireAutoTopupLock(companyId: string, ttlSeconds = 60): Promise<boolean> {
  try {
    const svc = requireServiceClient()
    const { data, error } = await svc.rpc('acquire_autotopup_lock', {
      p_company_id: companyId,
      p_ttl_seconds: ttlSeconds,
    })
    if (error) return false
    return data === true
  } catch (err) {
    console.warn('[acquireAutoTopupLock] swallowed failure, failing closed:', err)
    return false
  }
}

/** Release — best-effort, never throws (a failed release self-heals via the TTL). */
export async function releaseAutoTopupLock(companyId: string): Promise<void> {
  try {
    const svc = requireServiceClient()
    await svc.rpc('release_autotopup_lock', { p_company_id: companyId })
  } catch (err) {
    console.warn('[releaseAutoTopupLock] swallowed failure (TTL will self-heal):', err)
  }
}

/**
 * Independent threshold check (research Pitfall 3): this has NO relationship
 * to billing_config.lowBalanceThresholds — it reads the company's OWN
 * auto_topup_threshold_credits, tenant-configured, entirely separate from the
 * platform-wide informational notification thresholds.
 */
export async function triggerAutoTopupIfNeeded(input: {
  companyId: string
  newBalance: number
}): Promise<void> {
  try {
    const cfg = await getBillingConfig()
    if (!cfg.autoTopupEnabled) return // platform kill switch off

    const svc = requireServiceClient()
    const { data: co } = await svc
      .from('companies')
      .select(
        'auto_topup_enabled, auto_topup_threshold_credits, auto_topup_pack_index, stripe_customer_id'
      )
      .eq('id', input.companyId)
      .maybeSingle()

    const company = co as {
      auto_topup_enabled?: boolean
      auto_topup_threshold_credits?: number | null
      auto_topup_pack_index?: number | null
      stripe_customer_id?: string | null
    } | null

    if (!company?.auto_topup_enabled) return
    if (company.auto_topup_threshold_credits == null) return
    if (input.newBalance >= company.auto_topup_threshold_credits) return
    if (!company.stripe_customer_id || company.auto_topup_pack_index == null) return

    const lockAcquired = await acquireAutoTopupLock(input.companyId)
    if (!lockAcquired) return // another concurrent debit already holds the lock — skip

    try {
      await chargeAutoTopup({
        companyId: input.companyId,
        stripeCustomerId: company.stripe_customer_id,
        packIndex: company.auto_topup_pack_index,
      })
    } finally {
      await releaseAutoTopupLock(input.companyId)
    }
  } catch (err) {
    console.warn('[triggerAutoTopupIfNeeded] swallowed failure:', err)
  }
}

/**
 * The actual off-session charge. Separated from the trigger/lock logic so
 * Plan 03's settings-save/failure-surfacing work can extend this function's
 * body (resolve payment method, call paymentIntents.create, handle failure)
 * without touching the lock-acquisition contract above.
 *
 * THIS PLAN implements the full charge attempt (payment-method resolution +
 * paymentIntents.create + failure recording) — Plan 03 does NOT re-open this
 * function, it only builds the setup-session route that populates the
 * payment method this function reads.
 */
async function chargeAutoTopup(input: {
  companyId: string
  stripeCustomerId: string
  packIndex: number
}): Promise<void> {
  const svc = requireServiceClient()
  try {
    const stripe = await getStripeClient()
    const customer = (await stripe.customers.retrieve(input.stripeCustomerId, {
      expand: ['invoice_settings.default_payment_method'],
    })) as unknown as {
      invoice_settings?: { default_payment_method?: { id: string } | string | null }
    }
    const pm = customer.invoice_settings?.default_payment_method
    const paymentMethodId = typeof pm === 'string' ? pm : pm?.id
    if (!paymentMethodId) {
      throw new Error('no payment method on file')
    }

    const cfg = await getBillingConfig()
    const pack = cfg.topUpPacks[input.packIndex]
    if (!pack) {
      throw new Error(`invalid auto_topup_pack_index ${input.packIndex}`)
    }

    await stripe.paymentIntents.create(
      {
        amount: pack.priceCents,
        currency: 'usd',
        customer: input.stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        error_on_requires_action: true,
        metadata: {
          type: 'auto_topup',
          companyId: input.companyId,
          credits: String(pack.credits),
        },
      },
      { idempotencyKey: `autotopup:${input.companyId}:${Date.now()}` }
    )

    // Success — clear any prior failure flag so the tenant-facing banner clears.
    await svc.from('companies').update({ auto_topup_last_failed_at: null }).eq('id', input.companyId)
  } catch (err) {
    // Failure handling (research decision #7): NEVER retry silently. Record
    // the failure timestamp so the tenant sees "auto-top-up failed" on their
    // next low-balance view; systemic-rate alerting is Plan 03's concern.
    console.warn('[chargeAutoTopup] off-session charge failed:', err)
    await svc
      .from('companies')
      .update({ auto_topup_last_failed_at: new Date().toISOString() })
      .eq('id', input.companyId)
  }
}
