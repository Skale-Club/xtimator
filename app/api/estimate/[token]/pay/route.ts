import { type NextRequest, NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { normalizeCurrencyCode } from '@/lib/money/currency'
import { getEstimateByShareToken } from '@/lib/queries/share'
import { requireServiceClient } from '@/lib/supabase/service'
import { isDemoCompany } from '@/lib/demo/config'
import { resolveBaseUrl } from '@/lib/utils/site-url'

/**
 * Phase 70 — Stripe Connect customer payments (CONNECT-07).
 *
 * Creates a Stripe Checkout Session ON the connected account using Direct
 * Charges (per-request `stripeAccount` option). 303-redirects the customer to
 * the hosted Checkout URL. Webhook (Plan 70-04) is the source of truth for
 * marking the estimate paid; this route only initiates the payment.
 *
 * Invariants enforced by tests/unit/billing/estimate-pay.test.ts:
 *   - stripeAccount = company.stripe_account_id
 *   - metadata.{estimate_id, company_id} populated on Session AND PaymentIntent
 *   - application_fee_amount is OMITTED (RESEARCH Pitfall 2 — Stripe rejects 0)
 *   - 303 redirect (HTML form POST → browser follows as GET)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const data = await getEstimateByShareToken(token)
  if (!data) {
    return NextResponse.json(
      { ok: false, message: 'Estimate not found' },
      { status: 404 }
    )
  }

  const { estimate } = data

  // Re-fetch the company directly (the share query exposes Connect status, but
  // we want the canonical row at the moment of payment in case the tenant just
  // disconnected). Service client bypasses RLS — safe here because the share
  // token already authenticated the request scope.
  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('id, stripe_account_id, stripe_connect_status')
    .eq('id', estimate.company_id)
    .single()

  if (!company?.stripe_account_id || company.stripe_connect_status !== 'active') {
    return NextResponse.json(
      { ok: false, message: 'Payments not available for this estimate' },
      { status: 400 }
    )
  }
  // Demo estimates never initiate a real payment (D06 — no external side effects).
  if (isDemoCompany(company.id)) {
    return NextResponse.json(
      { ok: false, message: 'Payments are disabled in the demo.' },
      { status: 403 }
    )
  }
  if (estimate.payment_status === 'paid') {
    return NextResponse.json(
      { ok: false, message: 'Already paid' },
      { status: 400 }
    )
  }
  const amountCents = estimate.total_amount_cents ?? 0
  if (amountCents <= 0) {
    return NextResponse.json(
      { ok: false, message: 'Invalid amount' },
      { status: 400 }
    )
  }

  const origin = resolveBaseUrl(req)
  const stripe = await getStripeClient()
  const currencyCode = normalizeCurrencyCode(estimate.currency_code)

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: currencyCode.toLowerCase(),
            product_data: {
              name: estimate.project?.name ?? 'Service estimate',
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      // success_url MUST keep the literal {CHECKOUT_SESSION_ID} template
      // (no URL encoding) — Stripe substitutes it before redirecting.
      success_url: `${origin}/estimate/${token}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/estimate/${token}?stripe=canceled`,
      metadata: {
        estimate_id: estimate.id,
        company_id: company.id,
      },
      payment_intent_data: {
        metadata: {
          estimate_id: estimate.id,
          company_id: company.id,
        },
        // CRITICAL: application_fee_amount intentionally OMITTED.
        // RESEARCH Pitfall 2 — Stripe rejects 0. Omitting yields 100% to the
        // connected account (minus Stripe's own processing fees).
      },
    },
    {
      stripeAccount: company.stripe_account_id,
      idempotencyKey: `pay_${estimate.id}_${Date.now()}`,
    }
  )

  if (!session.url) {
    return NextResponse.json(
      { ok: false, message: 'Stripe did not return a URL' },
      { status: 502 }
    )
  }

  // 303 redirect: HTML form POST → browser follows as GET to Stripe Checkout.
  return NextResponse.redirect(session.url, 303)
}
