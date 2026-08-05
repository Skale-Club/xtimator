import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'
import {
  commissionPayableAt,
  computeCommissionCents,
  isWithinCommissionWindow,
  resolveCommissionPct,
} from '@/lib/affiliates/commission'

/**
 * SEED-054 — accrue an affiliate commission for one PAID subscription invoice.
 *
 * Called from the `invoice.paid` arm of the Stripe platform webhook, next to
 * the monthly credit grant. Deliberately mirrors grantCredits' contract:
 *
 *   - NEVER THROWS. The webhook route deletes its dedup row and returns 500 on a
 *     thrown error, making Stripe retry the WHOLE event — a commission hiccup
 *     must not re-run tier updates and credit grants. Failures are logged and
 *     swallowed; the backstop is a reconciliation pass over
 *     `affiliate_commissions` vs Stripe invoices.
 *   - IDEMPOTENT on `commission:{invoiceId}` (UNIQUE in the DB), so a redelivered
 *     webhook or a manual resend accrues exactly once.
 *
 * Money never moves here: the row lands at status `pending` with a `payable_at`
 * hold. The (not-yet-built) payout runner is what issues Stripe Transfers.
 */
export async function accrueCommissionForInvoice(input: {
  companyId: string
  invoiceId: string
  /** `invoice.amount_paid` — what the customer ACTUALLY paid, in integer cents.
   * Never the total/subtotal: a discounted or credit-balance-covered invoice
   * must not over-pay the affiliate. */
  amountPaidCents: number
  currency: string
  /** Stripe event id, stored for audit/reconciliation only — NOT the dedup key
   * (a resend carries a new event id but the same invoice). */
  eventId: string
  /** When the invoice was paid; drives the commission-window check. */
  paidAt?: Date
}): Promise<void> {
  try {
    const cfg = await getBillingConfig()
    if (!cfg.affiliate.enabled) return
    if (!(input.amountPaidCents > 0)) return

    const svc = requireServiceClient()

    // Single joined read: the referral for this company plus the owning
    // affiliate's status and negotiated rate.
    const { data, error } = await svc
      .from('affiliate_referrals')
      .select(
        'id, affiliate_id, status, commission_window_ends_at, affiliates(id, status, commission_pct_override)'
      )
      .eq('company_id', input.companyId)
      .maybeSingle()

    if (error) throw new Error(`referral lookup failed: ${error.message}`)
    if (!data) return // company was never referred — the common case

    const referral = data as unknown as {
      id: string
      affiliate_id: string
      status: string
      commission_window_ends_at: string
      affiliates: { id: string; status: string; commission_pct_override: number | null } | null
    }

    if (referral.status !== 'active') return
    // A suspended affiliate stops earning immediately; a 'pending' one never
    // started. Both keep their historical rows untouched.
    if (referral.affiliates?.status !== 'active') return

    const paidAt = input.paidAt ?? new Date()
    const windowEndsAt = new Date(referral.commission_window_ends_at)
    if (!isWithinCommissionWindow(paidAt, windowEndsAt)) {
      // Window elapsed. Mark the referral expired so future invoices short-circuit
      // on the status check above instead of re-parsing the date every month.
      await svc
        .from('affiliate_referrals')
        .update({ status: 'expired' })
        .eq('id', referral.id)
        .eq('status', 'active')
      return
    }

    const pct = resolveCommissionPct(
      referral.affiliates?.commission_pct_override,
      cfg.affiliate.commissionPct
    )
    const commissionCents = computeCommissionCents(input.amountPaidCents, pct)
    // A rate of 0, or an invoice small enough to round to nothing, produces no
    // row at all — an empty $0.00 commission is noise in the affiliate's ledger.
    if (commissionCents <= 0) return

    const { error: insertError } = await svc.from('affiliate_commissions').insert({
      affiliate_id: referral.affiliate_id,
      referral_id: referral.id,
      company_id: input.companyId,
      stripe_invoice_id: input.invoiceId,
      stripe_event_id: input.eventId,
      idempotency_key: commissionIdempotencyKey(input.invoiceId),
      base_amount_cents: input.amountPaidCents,
      commission_pct: pct,
      commission_amount_cents: commissionCents,
      currency: input.currency.toLowerCase(),
      status: 'pending',
      payable_at: commissionPayableAt(paidAt, cfg.affiliate.holdDays).toISOString(),
    })

    // 23505 = this invoice already accrued (webhook redelivery). Not an error.
    if (insertError && insertError.code !== '23505') {
      throw new Error(`commission insert failed: ${insertError.message}`)
    }
  } catch (err) {
    console.warn('[accrueCommissionForInvoice] swallowed failure:', err)
  }
}

/** The single dedup authority for an invoice's commission — also the UNIQUE
 * column value in `affiliate_commissions.idempotency_key`. */
export function commissionIdempotencyKey(invoiceId: string): string {
  return `commission:${invoiceId}`
}
