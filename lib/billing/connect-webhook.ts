import 'server-only'
import type Stripe from 'stripe'
import type { requireServiceClient } from '@/lib/supabase/service'

/**
 * Connected-account Stripe webhook handler (Phase 70, plan 70-04).
 *
 * The discriminator between platform and Connect events is `event.account`:
 * present (acct_xxx) iff the event originated from a connected account.
 * The platform webhook entry point in `app/api/webhooks/stripe/route.ts`
 * branches on that field and delegates Connect events here.
 *
 * Events handled:
 *   - checkout.session.completed → mark estimate paid + fire 2 emails
 *   - account.application.deauthorized → clear company connection
 *   - account.updated → sync display name / email (best effort)
 *   - other types → silently ignored
 *
 * Idempotency is enforced upstream in the route via the existing
 * `processed_stripe_events` ON CONFLICT insert — by the time we get here
 * the event id has already been claimed exactly once.
 */

type ServiceClient = ReturnType<typeof requireServiceClient>

export async function handleConnectEvent(
  event: Stripe.Event,
  _stripe: Stripe,
  svc: ServiceClient
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event, svc)
      return

    case 'account.application.deauthorized':
      await handleAccountDeauthorized(event, svc)
      return

    case 'account.updated':
      await handleAccountUpdated(event, svc)
      return

    default:
      // Other Connect events — accept and ignore so future Stripe additions
      // don't crash the handler.
      return
  }
}

// ------------------------------------------------------------------
// checkout.session.completed
// ------------------------------------------------------------------
async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  svc: ServiceClient
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session
  const estimateId = session.metadata?.estimate_id
  if (!estimateId) {
    console.warn(
      '[stripe-webhook][connect] checkout.session.completed missing metadata.estimate_id'
    )
    return
  }

  // Single-shot update — dedup table upstream already prevented duplicate event.
  const { data: updated, error } = await svc
    .from('estimates')
    .update({
      payment_status: 'paid',
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent as string | null,
      paid_at: new Date().toISOString(),
      payment_amount_cents: session.amount_total,
    })
    .eq('id', estimateId)
    .select('id, company_id, project_id, share_token')
    .single()

  if (error || !updated) {
    console.error(
      '[stripe-webhook][connect] failed to mark estimate paid:',
      error,
      'estimateId=',
      estimateId
    )
    return
  }

  // Look up company + project for the email payload.
  const [companyRes, projectRes] = await Promise.all([
    svc
      .from('companies')
      .select('email, name, stripe_account_display_name')
      .eq('id', updated.company_id)
      .single(),
    svc
      .from('projects')
      .select('name')
      .eq('id', updated.project_id)
      .single(),
  ])

  const company = companyRes.data as
    | { email: string | null; name: string | null; stripe_account_display_name: string | null }
    | null
  const project = projectRes.data as { name: string | null } | null

  const customerEmail =
    session.customer_details?.email ?? session.customer_email ?? null
  const customerName = session.customer_details?.name ?? null

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://xtimator.com'

  // Dynamic import keeps the email module out of the hot path when no events fire.
  const { sendPaymentReceivedEmail, sendPaymentReceiptEmail } = await import(
    '@/lib/email/payment-emails'
  )

  const ctx = {
    amountCents: session.amount_total ?? 0,
    projectName: project?.name ?? 'Service estimate',
    estimateShareUrl: `${origin}/estimate/${updated.share_token}`,
    businessName:
      company?.stripe_account_display_name ??
      company?.name ??
      'Your service provider',
    businessEmail: company?.email ?? '',
    customerEmail,
    customerName,
  }

  // Fire both — allSettled so a Resend failure on one doesn't block the other,
  // and so the surrounding `await` resolves without rethrowing (the helpers
  // already swallow their own errors, but allSettled is belt-and-suspenders).
  await Promise.allSettled([
    sendPaymentReceivedEmail(ctx),
    sendPaymentReceiptEmail(ctx),
  ])
}

// ------------------------------------------------------------------
// account.application.deauthorized — user disconnected from Stripe side
// ------------------------------------------------------------------
async function handleAccountDeauthorized(
  event: Stripe.Event,
  svc: ServiceClient
): Promise<void> {
  const acctId = event.account
  if (!acctId) {
    console.warn('[stripe-webhook][connect] deauth event missing event.account')
    return
  }
  const { error } = await svc
    .from('companies')
    .update({
      stripe_account_id: null,
      stripe_connect_status: 'disconnected',
    })
    .eq('stripe_account_id', acctId)
  if (error) {
    console.error(
      '[stripe-webhook][connect] account.application.deauthorized update failed:',
      error
    )
  }
}

// ------------------------------------------------------------------
// account.updated — best-effort sync of display fields
// ------------------------------------------------------------------
async function handleAccountUpdated(
  event: Stripe.Event,
  svc: ServiceClient
): Promise<void> {
  const account = event.data.object as Stripe.Account
  const display =
    account.settings?.dashboard?.display_name ??
    account.business_profile?.name ??
    null
  const updates: Record<string, string> = {}
  if (account.email) updates.stripe_account_email = account.email
  if (display) updates.stripe_account_display_name = display
  if (Object.keys(updates).length === 0) return
  const { error } = await svc
    .from('companies')
    .update(updates)
    .eq('stripe_account_id', account.id)
  if (error) {
    console.error(
      '[stripe-webhook][connect] account.updated sync failed:',
      error
    )
  }
}
