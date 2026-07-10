import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { grantCredits } from '@/lib/billing/credit-ledger'

/**
 * Pre-launch audit fix (B2): hard cooldown between off-session charge
 * attempts for the SAME company, independent of the acquire/release lock
 * above (which only prevents true concurrency, not repeated attempts spread
 * over time). Without this, a company stuck below its threshold gets
 * re-charged on every single credit debit that crosses it.
 */
const CHARGE_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour between attempts
/** After a declined/failed charge, back off longer before retrying — the
 * tenant needs time to see the failure banner and fix their payment method. */
const FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1000 // 24 hours after a failure

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
        'auto_topup_enabled, auto_topup_threshold_credits, auto_topup_pack_index, auto_topup_pack_price_cents, auto_topup_pack_credits, stripe_customer_id, auto_topup_last_failed_at, auto_topup_last_charge_attempt_at'
      )
      .eq('id', input.companyId)
      .maybeSingle()

    const company = co as {
      auto_topup_enabled?: boolean
      auto_topup_threshold_credits?: number | null
      auto_topup_pack_index?: number | null
      auto_topup_pack_price_cents?: number | null
      auto_topup_pack_credits?: number | null
      stripe_customer_id?: string | null
      auto_topup_last_failed_at?: string | null
      auto_topup_last_charge_attempt_at?: string | null
    } | null

    if (!company?.auto_topup_enabled) return
    if (company.auto_topup_threshold_credits == null) return
    if (input.newBalance >= company.auto_topup_threshold_credits) return
    if (!company.stripe_customer_id || company.auto_topup_pack_index == null) return

    // Cooldown / backoff — prevents the redispatch-on-every-debit failure mode:
    // a company stuck below threshold must not be charged more than once per
    // hour, and gets a full day of breathing room after a declined charge.
    const now = Date.now()
    if (
      company.auto_topup_last_charge_attempt_at &&
      now - new Date(company.auto_topup_last_charge_attempt_at).getTime() < CHARGE_COOLDOWN_MS
    ) {
      return
    }
    if (
      company.auto_topup_last_failed_at &&
      now - new Date(company.auto_topup_last_failed_at).getTime() < FAILURE_BACKOFF_MS
    ) {
      return
    }

    const lockAcquired = await acquireAutoTopupLock(input.companyId)
    if (!lockAcquired) return // another concurrent debit already holds the lock — skip

    try {
      // Stamp the attempt BEFORE charging (success or failure) so the cooldown
      // applies even if the process crashes mid-charge or Stripe is slow.
      await svc
        .from('companies')
        .update({ auto_topup_last_charge_attempt_at: new Date().toISOString() })
        .eq('id', input.companyId)

      await chargeAutoTopup({
        companyId: input.companyId,
        stripeCustomerId: company.stripe_customer_id,
        packIndex: company.auto_topup_pack_index,
        packPriceCents: company.auto_topup_pack_price_cents ?? null,
        packCredits: company.auto_topup_pack_credits ?? null,
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
  packPriceCents?: number | null
  packCredits?: number | null
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

    // Charge what the tenant authorized: prefer the per-company snapshot
    // (price + credits captured at save time) so a later admin reorder/reprice
    // of billing_config.topUpPacks cannot change the amount. Legacy rows with a
    // null snapshot fall back to the index lookup (original behavior).
    let pack: { priceCents: number; credits: number }
    if (input.packPriceCents != null && input.packCredits != null) {
      pack = { priceCents: input.packPriceCents, credits: input.packCredits }
    } else {
      const cfg = await getBillingConfig()
      const configPack = cfg.topUpPacks[input.packIndex]
      if (!configPack) {
        throw new Error(`invalid auto_topup_pack_index ${input.packIndex}`)
      }
      pack = configPack
    }

    // Deterministic per-hour idempotency key: dedupes retried Stripe API calls
    // within the same attempt window, while the cooldown above already caps
    // real attempts to at most one per hour anyway.
    const hourBucket = new Date().toISOString().slice(0, 13) // YYYY-MM-DDTHH
    const paymentIntent = await stripe.paymentIntents.create(
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
      { idempotencyKey: `autotopup:${input.companyId}:${hourBucket}` }
    )

    // Grant credits synchronously — the card has already been charged
    // (confirm:true + error_on_requires_action:true means paymentIntents.create
    // only resolves without throwing once Stripe confirms the charge). The
    // webhook's payment_intent.succeeded handler grants the SAME idempotency
    // key as a durable backstop in case this process crashes before returning,
    // so the two paths dedupe against each other rather than double-granting.
    await grantCredits({
      companyId: input.companyId,
      credits: pack.credits,
      reason: 'topup',
      refId: paymentIntent.id,
      idempotencyKey: `autotopup:${paymentIntent.id}`,
    })

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
