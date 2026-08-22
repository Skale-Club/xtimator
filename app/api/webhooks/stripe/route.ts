import { type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/billing/stripe-client'
import {
  connectEventRequiresCompanyResolution,
  handleConnectEvent,
  resolveConnectEventCompanyId,
} from '@/lib/billing/connect-webhook'
import { requireServiceClient } from '@/lib/supabase/service'
import { dispatchXphereSync } from '@/lib/integrations/xphere/dispatch'
import { grantCredits, monthGrantKey } from '@/lib/billing/credit-ledger'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { resolveTierFromPriceId } from '@/lib/billing/stripe-price-map'
import { notifyOps } from '@/lib/observability/ops-alert'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { accrueCommissionForInvoice } from '@/lib/affiliates/accrual'

// ------------------------------------------------------------------
// POST: Stripe webhook handler (STRIPE-02, STRIPE-04)
//
// CRITICAL order (same as WhatsApp webhook):
//   1. request.text() FIRST — get raw body BEFORE any parsing
//   2. stripe.webhooks.constructEvent() — verifies signature against raw body
//   3. Resolve trusted company identity from the signed event / server rows
//   4. Deny demo-company effects
//   5. Idempotency check — insert event_id into processed_stripe_events
//   6. Handle event — update companies table
//   7. Return 200 — Stripe stops retrying
// ------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // Step 1: raw body MUST come before any parsing (RESEARCH Pitfall 1)
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''

  // Two webhook endpoints share this URL: the platform endpoint (subscription
  // events) and the Connect endpoint (connected-account events). Each has its
  // own signing secret. Try each in turn so a single handler serves both.
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? ''

  let stripe: Stripe
  try {
    stripe = await getStripeClient()
  } catch (err) {
    // Stripe secret key not configured for this deployment. Returning 500/throwing
    // makes Stripe hammer the endpoint with retries and floods Sentry (XTIMATOR-1).
    // Log for server-side visibility and return 503 so Stripe retries later once
    // STRIPE_SECRET_KEY is configured (Coolify env or /admin/integrations).
    console.error('[Stripe] Webhook received but Stripe is not configured:', err instanceof Error ? err.message : err)
    return new Response('Stripe not configured', { status: 503 })
  }

  // Step 2: verify signature — try platform secret first, then connect secret
  let event: Stripe.Event | null = null
  let lastErrorMessage = 'No webhook secrets configured'

  for (const secret of [platformSecret, connectSecret]) {
    if (!secret) continue
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret)
      break
    } catch (err) {
      lastErrorMessage = err instanceof Error ? err.message : 'Unknown error'
    }
  }

  if (!event) {
    console.warn('[Stripe] Webhook signature verification failed:', lastErrorMessage)
    return new Response(`Webhook error: ${lastErrorMessage}`, { status: 400 })
  }

  // Step 3: read-only trusted-company resolution after signature verification.
  const svc = requireServiceClient()

  let resolvedCompanyId: string | null
  try {
    resolvedCompanyId = event.account
      ? await resolveConnectEventCompanyId(event, svc)
      : await resolvePlatformEventCompanyId(event, svc, stripe)
  } catch (err) {
    console.error('[Stripe] Failed to resolve webhook company:', err)
    return new Response('Internal error', { status: 500 })
  }

  const denied = await assertCompanyWritable(resolvedCompanyId)
  if (denied) {
    // Acknowledge the signed delivery so Stripe does not retry an event that is
    // intentionally ineligible for product effects.
    return new Response('Demo company event ignored', { status: 200 })
  }

  if (!resolvedCompanyId && requiresCompanyResolution(event)) {
    console.warn(
      '[Stripe] Signed tenant event has no trusted company mapping; ignoring:',
      event.type,
      event.id,
    )
    // Best-effort ops visibility: an event that SHOULD map to a company but
    // doesn't is silently dropped forever (Stripe won't redeliver a 200'd
    // event). notifyOps never throws, so a Redis/Sentry/Telegram hiccup can
    // never turn this into a 500 that makes Stripe retry pointlessly.
    void notifyOps({
      kind: 'stripe_event_unresolved',
      title: 'Stripe event could not be mapped to a company',
      message: `${event.type} ${event.id}`,
      severity: 'warning',
      dedupeKey: `stripe_event_unresolved:${event.id}`,
    })
    return new Response('Company not resolved', { status: 200 })
  }

  // Step 5: idempotency — insert event_id; 23505 = already processed
  const { error: dedupError } = await svc
    .from('processed_stripe_events')
    .insert({ event_id: event.id })

  if (dedupError?.code === '23505') {
    // Duplicate event — acknowledge without reprocessing (STRIPE-04)
    return new Response('Already processed', { status: 200 })
  }

  if (dedupError) {
    // Unexpected DB error — return 500 so Stripe retries
    console.error('[Stripe] Failed to record event:', dedupError)
    return new Response('Internal error', { status: 500 })
  }

  // Step 4: handle event.
  //
  // Pre-launch audit fix (B5): the dedup row above is inserted BEFORE
  // handling (needed to reject a second COPY of the same event arriving
  // concurrently — see Pitfall below), but that made the dedup "at-most-once"
  // in the wrong direction: if handleStripeEvent throws (a transient error,
  // e.g. stripe.subscriptions.retrieve failing in the invoice.paid arm), this
  // route returns 500, Stripe retries, and the retry hits the dedup row we
  // already inserted — "Already processed" — permanently dropping an event
  // that never actually succeeded (a paid checkout that never grants the
  // tier/credits, with no further retry).
  //
  // Fix: on a thrown error, delete the dedup row before returning 500, so the
  // NEXT delivery (Stripe's automatic retry, or a manual resend) is treated
  // as fresh rather than already-processed. Concurrent-duplicate-delivery
  // protection is preserved because the row still exists for the ENTIRE
  // duration of a successful handling — only a genuine failure clears it.
  try {
    await handleStripeEvent(event, stripe, svc, resolvedCompanyId)
  } catch (err) {
    console.error('[Stripe] handleStripeEvent failed, clearing dedup row for retry:', err)
    await svc.from('processed_stripe_events').delete().eq('event_id', event.id)
    return new Response('Internal error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}

// ------------------------------------------------------------------
// Top-level dispatch: Connect events carry `event.account` (acct_xxx);
// platform (subscription) events do not. Plan 70-04 wires the Connect
// branch — existing platform event handling is untouched (zero regression).
// ------------------------------------------------------------------
async function handleStripeEvent(
  event: Stripe.Event,
  stripe: Stripe,
  svc: ReturnType<typeof requireServiceClient>,
  resolvedCompanyId: string | null,
): Promise<void> {
  if (event.account) {
    return handleConnectEvent(event, stripe, svc, resolvedCompanyId)
  }
  return handlePlatformEvent(event, stripe, svc, resolvedCompanyId)
}

async function readMappedCompanyId(
  svc: ReturnType<typeof requireServiceClient>,
  column: 'stripe_subscription_id' | 'stripe_customer_id',
  value: string,
): Promise<string | null> {
  const { data, error } = await svc
    .from('companies')
    .select('id')
    .eq(column, value)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[Stripe] company lookup failed for ${column}: ${error.message}`,
    )
  }

  return (data as { id?: string | null } | null)?.id ?? null
}

async function resolvePlatformEventCompanyId(
  event: Stripe.Event,
  svc: ReturnType<typeof requireServiceClient>,
  stripe: Stripe,
): Promise<string | null> {
  const object = event.data.object as {
    id?: string
    metadata?: Record<string, string> | null
    subscription?: string | { id?: string } | null
    subscription_details?: {
      metadata?: Record<string, string> | null
    } | null
    customer?: string | { id?: string } | null
    parent?: {
      type?: string
      subscription_details?: {
        subscription?: string | { id?: string } | null
        metadata?: Record<string, string> | null
      } | null
    } | null
  }

  const metadataCompanyId =
    object.metadata?.companyId ?? object.metadata?.company_id
  if (metadataCompanyId) return metadataCompanyId

  // Event-ordering race (critical): Stripe does not guarantee delivery order,
  // and for a brand-new customer invoice.paid frequently arrives BEFORE
  // checkout.session.completed. At that point companies.stripe_subscription_id
  // / stripe_customer_id are not written yet AND invoice.metadata is empty
  // (invoices don't carry the Checkout session's metadata). But Checkout sets
  // subscription_data.metadata.companyId, and Stripe exposes THAT
  // subscription-level metadata on the invoice — under
  // parent.subscription_details.metadata in the 2025+ API shape, or the
  // legacy top-level subscription_details.metadata on older API versions.
  // Check both before falling back to the DB row lookups below.
  const parentSubscriptionDetails =
    object.parent?.type === 'subscription_details'
      ? object.parent.subscription_details
      : null
  const parentMetadataCompanyId =
    parentSubscriptionDetails?.metadata?.companyId
  if (parentMetadataCompanyId) return parentMetadataCompanyId

  const legacyMetadataCompanyId = object.subscription_details?.metadata?.companyId
  if (legacyMetadataCompanyId) return legacyMetadataCompanyId

  let subscriptionId: string | null = null
  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    subscriptionId = object.id ?? null
  } else if (typeof object.subscription === 'string') {
    subscriptionId = object.subscription
  } else if (object.subscription?.id) {
    subscriptionId = object.subscription.id
  } else {
    const parentSubscription = parentSubscriptionDetails?.subscription
    subscriptionId =
      typeof parentSubscription === 'string'
        ? parentSubscription
        : parentSubscription?.id ?? null
  }

  if (subscriptionId) {
    const companyId = await readMappedCompanyId(
      svc,
      'stripe_subscription_id',
      subscriptionId,
    )
    if (companyId) return companyId
  }

  const customerId =
    typeof object.customer === 'string'
      ? object.customer
      : object.customer?.id ?? null
  if (customerId) {
    const companyId = await readMappedCompanyId(svc, 'stripe_customer_id', customerId)
    if (companyId) return companyId
  }

  // Last resort: neither metadata path nor the DB rows resolved a company
  // (the checkout.session.completed write hasn't landed yet). Retrieve the
  // subscription directly from Stripe and read its metadata — the same
  // subscription_data.metadata.companyId Checkout set at creation time, just
  // fetched live instead of relying on it being embedded in this event's payload.
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const companyId = (subscription.metadata as Record<string, string> | undefined)
        ?.companyId
      if (companyId) return companyId
    } catch (err) {
      console.warn(
        '[Stripe] resolvePlatformEventCompanyId: subscriptions.retrieve fallback failed:',
        subscriptionId,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return null
}

function requiresCompanyResolution(event: Stripe.Event): boolean {
  if (event.account) {
    return connectEventRequiresCompanyResolution(event)
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded' ||
    event.type === 'invoice.paid' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    return true
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    return paymentIntent.metadata?.type === 'auto_topup'
  }

  return false
}

// ------------------------------------------------------------------
// Backfill companies.stripe_customer_id from a top-up / setup-mode Checkout
// session. These sessions can be the FIRST Stripe touchpoint for a company
// that has never subscribed (a free-tier company buying a one-off credit
// pack), so stripe_customer_id may still be null on the row. WHERE
// stripe_customer_id IS NULL (via .is()) — never overwrite an id a
// subscription checkout already wrote.
// ------------------------------------------------------------------
async function persistStripeCustomerId(
  svc: ReturnType<typeof requireServiceClient>,
  companyId: string,
  customerId: string,
): Promise<void> {
  const { error } = await svc
    .from('companies')
    .update({ stripe_customer_id: customerId })
    .eq('id', companyId)
    .is('stripe_customer_id', null)
  if (error) {
    console.warn('[Stripe] stripe_customer_id backfill failed:', error.message)
  }
}

// ------------------------------------------------------------------
// Backfill companies.stripe_subscription_id — used by the invoice.paid
// event-ordering fallback (SHOULD-FIX 3): when invoice.paid resolves a
// company via resolvedCompanyId (not the stripe_subscription_id mapping,
// because that mapping is exactly what's missing), write the mapping now so
// FUTURE events for this subscription hit the fast primary-lookup path
// instead of repeating the fallback every time. WHERE stripe_subscription_id
// IS NULL — never overwrite a mapping a concurrent checkout.session.completed
// (or a genuinely different subscription) already wrote.
// ------------------------------------------------------------------
async function persistStripeSubscriptionId(
  svc: ReturnType<typeof requireServiceClient>,
  companyId: string,
  subscriptionId: string,
): Promise<void> {
  const { error } = await svc
    .from('companies')
    .update({ stripe_subscription_id: subscriptionId })
    .eq('id', companyId)
    .is('stripe_subscription_id', null)
  if (error) {
    console.warn('[Stripe] stripe_subscription_id backfill failed:', error.message)
  }
}

// ------------------------------------------------------------------
// TOPUP-02 shared grant logic — a one-time credit top-up (mode:'payment').
// Shared between checkout.session.completed (synchronous card payment) and
// checkout.session.async_payment_succeeded (delayed-payment methods like ACH
// that settle later) so the two event types don't duplicate this logic.
// metadata values are STRINGS — parse credits (Pitfall 5). Idempotent on the
// caller-supplied key (event.id is fine — a session fires exactly ONE of
// these two event types on its way to paid, never both).
// ------------------------------------------------------------------
async function grantTopupCredits(
  session: Stripe.Checkout.Session,
  svc: ReturnType<typeof requireServiceClient>,
  idempotencyKey: string,
): Promise<void> {
  const topupCompanyId = session.metadata?.companyId
  const credits = Number(session.metadata?.credits)

  if (topupCompanyId && typeof session.customer === 'string') {
    await persistStripeCustomerId(svc, topupCompanyId, session.customer)
  }

  if (topupCompanyId && credits > 0) {
    await grantCredits({
      companyId: topupCompanyId,
      credits,
      reason: 'topup',
      refId: session.id,
      idempotencyKey,
    })
  }
}

// ------------------------------------------------------------------
// Platform event handler — subscription/billing lifecycle (STRIPE-02)
// (Originally the body of handleStripeEvent; renamed verbatim for the
// Connect branch in plan 70-04.)
// ------------------------------------------------------------------
async function handlePlatformEvent(
  event: Stripe.Event,
  stripe: Stripe,
  svc: ReturnType<typeof requireServiceClient>,
  resolvedCompanyId: string | null,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      // TOPUP-02: one-time credit top-up (mode:'payment'). Handle BEFORE the
      // subscription-mode early-break below, or this arm never runs (Pitfall 3).
      // Shared with checkout.session.async_payment_succeeded via grantTopupCredits
      // (also persists stripe_customer_id — see that helper). Idempotent on event.id.
      if (session.metadata?.type === 'credit_topup' && session.payment_status === 'paid') {
        await grantTopupCredits(session, svc, event.id)
        break
      }

      // CREDITUI-07: mode:'setup' session completed — attach the resulting
      // payment method as the customer's default. Must run BEFORE the
      // subscription-mode fall-through below, or this arm is unreachable
      // (Research Pitfall 1).
      if (session.metadata?.type === 'autotopup_setup' && session.setup_intent) {
        // Backfill stripe_customer_id BEFORE the attach logic — a company
        // setting up auto-top-up may never have subscribed, so this can be
        // the first write of its Stripe customer id.
        const setupCompanyId = session.metadata.companyId
        if (setupCompanyId && typeof session.customer === 'string') {
          await persistStripeCustomerId(svc, setupCompanyId, session.customer)
        }
        const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string)
        if (setupIntent.payment_method) {
          await stripe.customers.update(session.customer as string, {
            invoice_settings: { default_payment_method: setupIntent.payment_method as string },
          })
        }
        break
      }

      const companyId = session.metadata?.companyId
      if (!companyId || session.mode !== 'subscription') break

      // tier resolved from metadata.plan — stored at checkout creation (RESEARCH Pitfall 3)
      const tier = session.metadata?.plan === 'business' ? 'business' : 'pro'

      // Safety net: if this company already has a DIFFERENT subscription on file,
      // a fresh Checkout would leave the old one live and double-bill. Cancel the
      // old subscription before overwriting the row. Wrapped in try/catch — it may
      // already be canceled (e.g. the portal update flow migrated the same sub).
      const { data: existing } = await svc
        .from('companies')
        .select('stripe_subscription_id')
        .eq('id', companyId)
        .maybeSingle()

      const oldSubId = (existing as { stripe_subscription_id?: string | null } | null)
        ?.stripe_subscription_id
      const newSubId = session.subscription as string
      if (oldSubId && oldSubId !== newSubId) {
        try {
          await stripe.subscriptions.cancel(oldSubId)
          console.warn('[Stripe] checkout.session.completed canceled superseded subscription:', oldSubId)
        } catch (err) {
          console.warn('[Stripe] checkout.session.completed could not cancel old subscription (may already be canceled):', oldSubId, err instanceof Error ? err.message : err)
        }
      }

      // Event-ordering race fix: retrieve the subscription now for its
      // current_period_end AND status. invoice.paid also writes
      // tier_renews_at, but for a brand-new customer invoice.paid can arrive
      // BEFORE (or racing) this event, so seed it here too — best-effort. A
      // retrieve failure must NOT wipe a value the OTHER event may already
      // have written: tier_renews_at/stripe_subscription_status are added to
      // the update payload ONLY when the retrieve actually produced a value,
      // never unconditionally (a blind null/'active' would clobber a correct
      // tier_renews_at invoice.paid already wrote, or a real 'past_due'
      // status a later customer.subscription.updated already recorded).
      let tierRenewsAt: string | null = null
      let subscriptionStatus: string | null = null
      try {
        const newSub = await stripe.subscriptions.retrieve(newSubId) as unknown as {
          current_period_end?: number
          status?: string
        }
        if (newSub.current_period_end) {
          tierRenewsAt = new Date(newSub.current_period_end * 1000).toISOString()
        }
        // Fresh Checkout completion — a subscription's status genuinely is
        // 'active' at this point in the overwhelming common case, so default
        // to that if Stripe's payload omits `status` for some reason. Only a
        // FAILED retrieve (caught below) skips writing the field entirely.
        subscriptionStatus = newSub.status ?? 'active'
      } catch (err) {
        console.warn(
          '[Stripe] checkout.session.completed: subscriptions.retrieve for tier_renews_at/status failed:',
          err instanceof Error ? err.message : err,
        )
      }

      const { error } = await svc
        .from('companies')
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          tier,
          tier_trial_ends_at: null, // paid plan — clear trial
          ...(tierRenewsAt ? { tier_renews_at: tierRenewsAt } : {}),
          ...(subscriptionStatus ? { stripe_subscription_status: subscriptionStatus } : {}),
          // Clear any stale pending-cancel marker. A prior lapse
          // (customer.subscription.deleted) sets tier_cancelled_at=now() with
          // stripe_subscription_id=null; a fresh re-subscribe via Checkout skips
          // the upgrade guard (null sub id) and would otherwise leave the stale
          // timestamp, making page.tsx render "plan ends on <past date>" for a
          // freshly-active paying customer. customer.subscription.updated is not
          // guaranteed to fire on new-sub creation, so clear it here.
          tier_cancelled_at: null,
        })
        .eq('id', companyId)

      if (error) {
        console.error('[Stripe] checkout.session.completed update failed:', error)
      }

      // Mirror the subscription change into Xphere CRM (fire-and-forget).
      if (companyId) dispatchXphereSync(companyId, 'subscription.updated')

      // Phase 175 (PLAT-01) — a NEW paid subscription is platform revenue,
      // DISTINCT from a customer paying a tenant (tenant_payment_received in
      // connect-webhook.ts's Connect arms). Sibling, fire-and-forget.
      void notifyOps({
        kind: 'subscription_payment_received',
        title: `Subscription payment - tier ${tier}`,
        message: `Company ${companyId} - checkout ${session.id}${
          typeof session.amount_total === 'number' ? ` - $${(session.amount_total / 100).toFixed(2)}` : ''
        }`,
        severity: 'warning',
        dedupeKey: `subscription_payment_received:${event.id}`,
      })

      // Event-ordering race fix: grant the tier's monthly credit allowance
      // HERE too, not only in invoice.paid. Both this arm AND the invoice.paid
      // arm below grant with the EXACT SAME company-month key (monthGrantKey) —
      // that shared key, not event ordering, is what makes a double grant
      // impossible: whichever of the two events lands first performs the
      // grant (grantCredits records the idempotency key), and the other is a
      // harmless already-recorded no-op, regardless of which order Stripe
      // actually delivers them in. The previous "Grant ONLY in invoice.paid,
      // NOT here" comment predated this fix and no longer holds.
      //
      // Known limitation (documented, not fixed here): if a company changes
      // TIER mid-month (upgrade/downgrade via the portal or a new Checkout)
      // AFTER this month's key was already burnt by an earlier grant, this
      // call is a no-op — grantCredits sees the key already recorded and
      // skips, so the company keeps the EARLIER tier's grant amount for the
      // rest of the current month; the new tier's allowance starts next
      // month. No delta/top-up grant is issued for the difference.
      //
      // Best-effort: grantCredits itself never throws, but getBillingConfig
      // can (e.g. a DB hiccup reading platform_integrations); a failure here
      // must not turn the ALREADY-SUCCESSFUL tier/subscription update above
      // into a 500 that makes Stripe retry an update that already landed.
      try {
        const cfg = await getBillingConfig()
        await grantCredits({
          companyId,
          credits: cfg.tiers[tier]?.monthlyCreditGrant ?? 0,
          reason: 'grant',
          refId: session.id,
          idempotencyKey: monthGrantKey(companyId, new Date()),
        })
      } catch (err) {
        console.warn(
          '[Stripe] checkout.session.completed: monthly credit grant failed:',
          err instanceof Error ? err.message : err,
        )
      }
      break
    }

    // Delayed-payment methods (e.g. ACH debits) don't settle synchronously —
    // Checkout returns before payment succeeds, so the credit_topup grant in
    // checkout.session.completed above never fires for these (payment_status
    // is not yet 'paid' at completion time). This event fires once the async
    // payment actually settles; reuses the exact same grant logic.
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.metadata?.type === 'credit_topup') {
        await grantTopupCredits(session, svc, event.id)
      }
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null }
      const subId = (invoice.subscription as string | null) ??
        (invoice.parent?.type === 'subscription_details'
          ? (invoice.parent.subscription_details?.subscription as string | null)
          : null)
      if (!subId) break

      // Retrieve subscription to get current_period_end
      // Cast through unknown — Stripe API 2026-04-22 moved current_period_end under billing_details
      // but the runtime object still carries this field; TypeScript types haven't caught up
      const subscription = await stripe.subscriptions.retrieve(subId) as unknown as { current_period_end: number }
      const renewsAt = new Date(subscription.current_period_end * 1000).toISOString()

      // Resolve the company for this invoice — reading id, tier either way,
      // used below for the tier_renews_at write, the credit grant, AND the
      // commission accrual. Primary path: the stripe_subscription_id mapping
      // written by checkout.session.completed. FALLBACK (SHOULD-FIX 3, the
      // event-ordering race this whole fix is about): that mapping can still
      // be missing here -- invoice.paid frequently arrives BEFORE
      // checkout.session.completed lands, or that event can be lost entirely
      // -- so fall back to the ALREADY-TRUSTED resolvedCompanyId (resolved via
      // the signed event's own metadata / parent.subscription_details path,
      // or the stripe.subscriptions.retrieve last resort -- see
      // resolvePlatformEventCompanyId) rather than silently dropping
      // tier_renews_at / the grant / the commission for this delivery. This
      // arm only runs when resolvedCompanyId is non-null (invoice.paid is in
      // requiresCompanyResolution's list -- the route already 200'd and
      // returned before reaching here otherwise), and the event is already
      // dedup'd at this point, so a missed grant here would never retry.
      const { data: bySub } = await svc
        .from('companies')
        .select('id, tier')
        .eq('stripe_subscription_id', subId)
        .maybeSingle()
      let grantCompany = bySub as { id: string; tier?: string | null } | null
      let mappedByFallback = false

      if (!grantCompany?.id && resolvedCompanyId) {
        const { data: byId } = await svc
          .from('companies')
          .select('id, tier')
          .eq('id', resolvedCompanyId)
          .maybeSingle()
        grantCompany = byId as { id: string; tier?: string | null } | null
        mappedByFallback = !!grantCompany?.id
      }

      if (grantCompany?.id) {
        // Primary match found the row BY stripe_subscription_id, so updating
        // by that same column is safe. A fallback match found the row by id
        // instead -- precisely because stripe_subscription_id is NOT set yet
        // -- so the update must target id, not the (missing) subscription id.
        const { error } = mappedByFallback
          ? await svc
              .from('companies')
              .update({ tier_renews_at: renewsAt })
              .eq('id', grantCompany.id)
          : await svc
              .from('companies')
              .update({ tier_renews_at: renewsAt })
              .eq('stripe_subscription_id', subId)

        if (error) {
          console.error('[Stripe] invoice.paid update failed:', error)
        }

        if (mappedByFallback) {
          // Backfill the mapping itself (WHERE-null guarded in both helpers)
          // so FUTURE events for this subscription hit the fast primary-lookup
          // path instead of repeating this fallback every time.
          await persistStripeSubscriptionId(svc, grantCompany.id, subId)
          if (typeof invoice.customer === 'string') {
            await persistStripeCustomerId(svc, grantCompany.id, invoice.customer)
          }
        }
      } else {
        // Should not happen (see the arm-only-runs-when-resolved note above)
        // -- logged for visibility rather than silently doing nothing.
        console.warn(
          '[Stripe] invoice.paid: no company mapped by stripe_subscription_id or resolvedCompanyId fallback:',
          subId,
        )
      }

      // Phase 175 (PLAT-01) — subscription renewal payment received; platform
      // revenue event, unconditional on the credit-grant lookup below.
      void notifyOps({
        kind: 'subscription_payment_received',
        title: 'Subscription payment received',
        message: `subscription ${subId} - invoice ${invoice.id}${
          typeof invoice.amount_paid === 'number' ? ` - $${(invoice.amount_paid / 100).toFixed(2)}` : ''
        }`,
        severity: 'warning',
        dedupeKey: `subscription_payment_received:${event.id}`,
      })

      // TOPUP-01 / Phase 142 (ANN-02): grant the tier's monthly credit allowance.
      // Keyed on the COMPANY-MONTH key (`grant:{companyId}:{YYYY-MM}`) — the SINGLE
      // dedup authority shared with the monthly-credit-grant cron AND the
      // checkout.session.completed subscription arm. Both that arm AND this one
      // grant with the EXACT SAME key -- that shared key, not event ordering, is
      // what makes a double grant impossible: whichever event lands first
      // performs the grant, the other is a harmless already-recorded no-op,
      // regardless of delivery order. Consequences:
      //   - A redelivered webhook in the same month → still ONE grant (same key).
      //   - The cron no-ops a month the webhook already granted (monthly subs).
      //   - Annual subs: this fires month 1 (immediate UX), the cron covers 2-12.
      //
      // Known limitation (documented, not fixed here): if a company changes
      // TIER mid-month after this month's key was already burnt by an earlier
      // grant (either arm), this call is a no-op -- the company keeps the
      // EARLIER tier's grant amount for the rest of the current month; the new
      // tier's allowance starts next month. No delta/top-up grant is issued.
      // Best-effort, same rationale as the checkout arm's grant call:
      // grantCredits itself never throws, but getBillingConfig can — a
      // failure here must not turn the ALREADY-SUCCESSFUL tier_renews_at
      // write (and mapping backfill) above into a 500 that makes Stripe
      // retry the whole event over a transient config-read hiccup.
      if (grantCompany?.id) {
        try {
          const cfg = await getBillingConfig()
          const tierKey = (grantCompany.tier ?? 'free') as keyof typeof cfg.tiers
          const grant = cfg.tiers[tierKey]?.monthlyCreditGrant ?? 0
          await grantCredits({
            companyId: grantCompany.id,
            credits: grant,        // grantCredits no-ops on <=0 (free tier = 0)
            reason: 'grant',
            refId: invoice.id,
            idempotencyKey: monthGrantKey(grantCompany.id, new Date()), // company-month dedup (shared with cron)
          })
        } catch (err) {
          console.warn(
            '[Stripe] invoice.paid: monthly credit grant failed:',
            err instanceof Error ? err.message : err,
          )
        }
      }

      // SEED-054: accrue the affiliate commission for this paid invoice.
      //
      // Placed on invoice.paid (NOT checkout.session.completed) for the same
      // reason the credit grant is: this is the event that fires for BOTH the
      // first payment and every renewal, so a recurring commission needs no
      // second call site. Deduped on `commission:{invoiceId}`, so the redelivery
      // this handler's dedup-row-clear can cause accrues exactly once.
      //
      // accrueCommissionForInvoice never throws — a commission failure must not
      // trigger a 500 that makes Stripe retry the tier update and credit grant.
      if (grantCompany?.id && typeof invoice.amount_paid === 'number') {
        await accrueCommissionForInvoice({
          companyId: grantCompany.id,
          invoiceId: invoice.id ?? subId,
          amountPaidCents: invoice.amount_paid,
          currency: invoice.currency ?? 'usd',
          eventId: event.id,
        })
      }
      break
    }

    // Pre-launch audit fix (B2): auto-top-up off-session charges (see
    // lib/billing/auto-topup.ts) previously had NO webhook handler at all —
    // the card was charged but credits were never granted, and since the
    // balance stayed below threshold, every subsequent debit re-triggered a
    // new charge. This handler is a durable backstop: chargeAutoTopup() also
    // grants credits synchronously right after the charge succeeds, using the
    // SAME idempotency key (`autotopup:{paymentIntent.id}`) as here, so
    // whichever path runs first grants and the other is a harmless no-op —
    // covers the case where the serverless function crashes after Stripe
    // confirms the charge but before the synchronous grant call completes.
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      if (pi.metadata?.type === 'auto_topup') {
        const topupCompanyId = pi.metadata.companyId
        const credits = Number(pi.metadata.credits)
        if (topupCompanyId && credits > 0) {
          await grantCredits({
            companyId: topupCompanyId,
            credits,
            reason: 'topup',
            refId: pi.id,
            idempotencyKey: `autotopup:${pi.id}`,
          })
        }
      }
      break
    }

    case 'invoice.payment_failed': {
      // DO NOT downgrade — Stripe dunning handles retries (RESEARCH Pitfall 4)
      // customer.subscription.deleted fires only after all dunning retries exhausted
      const invoice = event.data.object as Stripe.Invoice
      console.warn('[Stripe] Payment failed for invoice:', invoice.id, '— no tier change applied')
      break
    }

    case 'customer.subscription.updated': {
      // Required for the Customer Portal update flow (create-checkout-session's
      // upgrade path) to reflect in the DB — a plan change made in the portal
      // arrives here, not via checkout.session.completed.
      const subscription = event.data.object as Stripe.Subscription

      // Map the first item's price id to a tier (null when unknown — leave tier as-is).
      const priceId = subscription.items?.data?.[0]?.price?.id ?? null
      const resolvedTier = await resolveTierFromPriceId(priceId)

      // current_period_end moved under a nested shape in the 2026-04-22 Stripe API
      // types but the runtime object still carries it — same cast as invoice.paid.
      const subWithPeriod = subscription as unknown as { current_period_end?: number | null }
      const renewsAt = subWithPeriod.current_period_end
        ? new Date(subWithPeriod.current_period_end * 1000).toISOString()
        : null

      // Pending-cancel tracking: cancel_at is set when cancel_at_period_end is true.
      const cancelledAt = subscription.cancel_at_period_end
        ? new Date((subscription.cancel_at as number) * 1000).toISOString()
        : null

      // Resolve the company BEFORE the update (for the CRM sync id below).
      const { data: c } = await svc
        .from('companies')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle()

      const updatePayload: {
        tier_renews_at: string | null
        tier_cancelled_at: string | null
        stripe_subscription_status: string | null
        tier?: string
      } = {
        tier_renews_at: renewsAt,
        tier_cancelled_at: cancelledAt,
        // Mirror Stripe's own subscription.status verbatim (active, trialing,
        // past_due, unpaid, ...) — a second, independent lifecycle signal
        // alongside tier (see the migration comment for why).
        stripe_subscription_status: subscription.status ?? null,
      }
      // Only overwrite tier when the price resolved to a known tier.
      if (resolvedTier) updatePayload.tier = resolvedTier

      const { error } = await svc
        .from('companies')
        .update(updatePayload)
        .eq('stripe_subscription_id', subscription.id)

      if (error) {
        console.error('[Stripe] customer.subscription.updated update failed:', error)
      }

      // Mirror the change into Xphere CRM (fire-and-forget). No-op if no row matched.
      if (c?.id) dispatchXphereSync(c.id, 'subscription.updated')
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription

      // Resolve the company BEFORE the update — the update clears
      // stripe_subscription_id, so the lookup must happen first.
      const { data: c } = await svc
        .from('companies')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle()

      const { error } = await svc
        .from('companies')
        .update({
          tier: 'free',
          stripe_subscription_id: null,
          tier_renews_at: null,
          tier_cancelled_at: new Date().toISOString(),
          stripe_subscription_status: 'canceled',
        })
        .eq('stripe_subscription_id', subscription.id)

      if (error) {
        console.error('[Stripe] customer.subscription.deleted update failed:', error)
      }

      // Mirror the churn into Xphere CRM (mapping forces tier='free' → 'Churned').
      if (c?.id) dispatchXphereSync(c.id, 'subscription.updated')
      break
    }

    default:
      // Unhandled event type — ignore silently (future events won't crash the handler)
      break
  }
}
