import 'server-only'
import type Stripe from 'stripe'
import type { requireServiceClient } from '@/lib/supabase/service'
import { notify } from '@/lib/notifications/dispatch'
import { notifyOps } from '@/lib/observability/ops-alert'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { formatMinorUnits } from '@/lib/money/currency'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
import { assertCompanyWritable } from '@/lib/demo/guard'

/**
 * Connected-account Stripe webhook handler (Phase 70, plan 70-04).
 *
 * The discriminator between platform and Connect events is `event.account`:
 * present (acct_xxx) iff the event originated from a connected account.
 * The platform webhook entry point in `app/api/webhooks/stripe/route.ts`
 * branches on that field and delegates Connect events here.
 *
 * Events handled:
 *   - checkout.session.completed → mark estimate paid + fire 2 emails (legacy)
 *   - invoice.paid → mark invoices row paid by metadata.invoice_id + fire 2
 *     emails + payment.received notification (Phase 94, INVOICE-05)
 *   - invoice.voided / invoice.marked_uncollectible → mark invoices row
 *     void/uncollectible by metadata.invoice_id (best effort)
 *   - invoice.payment_failed → leave invoices.status open, touch updated_at
 *     and log a warn (no EventType in the notification catalog fits this
 *     event, so no tenant notification is sent)
 *   - charge.refunded → payment.refunded notification (best effort);
 *     resolves via charge.invoice → invoices.stripe_invoice_id, falling
 *     back to the legacy estimates.stripe_payment_intent_id path
 *   - account.application.deauthorized → clear company connection
 *   - account.updated → sync display name / email (best effort)
 *   - other types → silently ignored
 *
 * Idempotency is enforced upstream in the route via the existing
 * `processed_stripe_events` ON CONFLICT insert — by the time we get here
 * the event id has already been claimed exactly once.
 */

type ServiceClient = ReturnType<typeof requireServiceClient>

async function readReferencedCompanyId(
  svc: ServiceClient,
  table: 'estimates' | 'invoices' | 'companies',
  column: string,
  value: string,
): Promise<string | null> {
  const { data, error } = await svc
    .from(table)
    .select(table === 'companies' ? 'id' : 'company_id')
    .eq(column, value)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[stripe-webhook][connect] failed to resolve company from ${table}.${column}: ${error.message}`,
    )
  }

  const row = data as { id?: string | null; company_id?: string | null } | null
  return row?.company_id ?? row?.id ?? null
}

/**
 * Security boundary (Fix 2): Connect events are otherwise resolved by
 * attacker-controllable metadata (metadata.company_id, estimate_id,
 * invoice_id, charge.invoice, payment_intent — all values Stripe merely
 * echoes back from what WE set at creation time on OUR OWN Checkout
 * sessions/invoices, but nothing stops a malicious connected account from
 * emitting a crafted event with the same-shaped metadata pointing at a
 * DIFFERENT company). Every resolution path must be bound to the account that
 * actually emitted the signed event: read the resolved company's
 * `stripe_account_id` and compare it against `event.account`. A mismatch
 * means the event does not actually belong to that company — log a warn, fire
 * an ops alert (deduped per event id), and return null so the caller treats
 * this exactly like an unresolved event (dropped with a 200, no writes).
 */
async function assertEventOwnsCompany(
  svc: ServiceClient,
  companyId: string,
  event: Stripe.Event,
): Promise<string | null> {
  const { data, error } = await svc
    .from('companies')
    .select('stripe_account_id')
    .eq('id', companyId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[stripe-webhook][connect] failed to verify company/account ownership: ${error.message}`,
    )
  }

  const companyAccountId =
    (data as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null

  if (companyAccountId !== event.account) {
    console.warn(
      '[stripe-webhook][connect] event.account does not match resolved company.stripe_account_id — dropping event:',
      'eventId=', event.id,
      'eventType=', event.type,
      'companyId=', companyId,
      'eventAccount=', event.account,
      'companyAccountId=', companyAccountId,
    )
    void notifyOps({
      kind: 'stripe_connect_account_mismatch',
      title: 'Stripe Connect event/company account mismatch',
      message: `event ${event.id} (${event.type}) claims company ${companyId} but that company's stripe_account_id is ${companyAccountId ?? 'null'}, not the emitting account ${event.account}`,
      severity: 'error',
      dedupeKey: event.id,
    })
    return null
  }

  return companyId
}

/**
 * Resolve a Connect event using only Stripe-signed metadata/account fields or
 * referenced rows. Browser cookies are never authority for this machine path.
 * Every non-null result is verified against the emitting account before being
 * returned (Fix 2) — a caller can trust whatever this function hands back.
 */
export async function resolveConnectEventCompanyId(
  event: Stripe.Event,
  svc: ServiceClient,
): Promise<string | null> {
  const companyId = await resolveConnectEventCompanyIdRaw(event, svc)
  if (!companyId) return null
  return assertEventOwnsCompany(svc, companyId, event)
}

async function resolveConnectEventCompanyIdRaw(
  event: Stripe.Event,
  svc: ServiceClient,
): Promise<string | null> {
  const object = event.data.object as {
    metadata?: Record<string, string> | null
    payment_intent?: string | Stripe.PaymentIntent | null
    invoice?: string | Stripe.Invoice | null
  }
  const metadataCompanyId =
    object.metadata?.company_id ?? object.metadata?.companyId
  if (metadataCompanyId) return metadataCompanyId

  if (
    event.type === 'checkout.session.completed' &&
    object.metadata?.estimate_id
  ) {
    return readReferencedCompanyId(
      svc,
      'estimates',
      'id',
      object.metadata.estimate_id,
    )
  }

  if (
    (event.type === 'invoice.paid' ||
      event.type === 'invoice.voided' ||
      event.type === 'invoice.marked_uncollectible' ||
      event.type === 'invoice.payment_failed') &&
    object.metadata?.invoice_id
  ) {
    return readReferencedCompanyId(
      svc,
      'invoices',
      'id',
      object.metadata.invoice_id,
    )
  }

  if (event.type === 'charge.refunded') {
    const invoiceId =
      typeof object.invoice === 'string' ? object.invoice : object.invoice?.id
    if (invoiceId) {
      const companyId = await readReferencedCompanyId(
        svc,
        'invoices',
        'stripe_invoice_id',
        invoiceId,
      )
      if (companyId) return companyId
    }

    // Legacy pre-Phase-94 path — see handleChargeRefunded below.
    const paymentIntent =
      typeof object.payment_intent === 'string'
        ? object.payment_intent
        : object.payment_intent?.id
    if (paymentIntent) {
      return readReferencedCompanyId(
        svc,
        'estimates',
        'stripe_payment_intent_id',
        paymentIntent,
      )
    }
  }

  if (
    (event.type === 'account.application.deauthorized' ||
      event.type === 'account.updated') &&
    event.account
  ) {
    return readReferencedCompanyId(
      svc,
      'companies',
      'stripe_account_id',
      event.account,
    )
  }

  return null
}

export function connectEventRequiresCompanyResolution(
  event: Stripe.Event,
): boolean {
  return [
    'checkout.session.completed',
    'invoice.paid',
    'invoice.voided',
    'invoice.marked_uncollectible',
    'invoice.payment_failed',
    'charge.refunded',
    'account.application.deauthorized',
    'account.updated',
  ].includes(event.type)
}

export async function handleConnectEvent(
  event: Stripe.Event,
  _stripe: Stripe,
  svc: ServiceClient,
  trustedCompanyId?: string | null,
): Promise<void> {
  const companyId =
    trustedCompanyId === undefined
      ? await resolveConnectEventCompanyId(event, svc)
      : trustedCompanyId
  const denied = await assertCompanyWritable(companyId)
  if (denied) return
  if (!companyId && connectEventRequiresCompanyResolution(event)) return

  switch (event.type) {
    case 'checkout.session.completed':
      // companyId is non-null here: checkout.session.completed is in
      // connectEventRequiresCompanyResolution's list, and the `!companyId &&
      // connectEventRequiresCompanyResolution(event)` guard above already
      // returned if it were null.
      await handleCheckoutSessionCompleted(event, svc, companyId as string)
      return

    case 'charge.refunded':
      // Phase 77 NOTIF-04 — payment.refunded notification (best-effort)
      await handleChargeRefunded(event, svc)
      return

    case 'account.application.deauthorized':
      await handleAccountDeauthorized(event, svc)
      return

    case 'account.updated':
      await handleAccountUpdated(event, svc)
      return

    case 'invoice.paid':
      // Phase 94 INVOICE-05 — a real Stripe Invoice (issued on the connected
      // account) was paid. Mark the matching `invoices` row paid by
      // metadata.invoice_id and reuse the payment-received + receipt emails
      // and the payment.received notification. The PLATFORM invoice.paid
      // (subscription renewals) is handled in handlePlatformEvent — that path
      // never reaches here because it carries no event.account.
      await handleInvoicePaid(event, svc, companyId as string)
      return

    case 'invoice.voided':
      await handleInvoiceStatusChange(event, svc, 'void', companyId as string)
      return

    case 'invoice.marked_uncollectible':
      await handleInvoiceStatusChange(event, svc, 'uncollectible', companyId as string)
      return

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event, svc, companyId as string)
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
  svc: ServiceClient,
  companyId: string
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session
  const estimateId = session.metadata?.estimate_id
  if (!estimateId) {
    console.warn(
      '[stripe-webhook][connect] checkout.session.completed missing metadata.estimate_id'
    )
    return
  }

  // Single-shot update — dedup table upstream already prevented duplicate
  // event. Scoped to the TRUSTED companyId (Fix 2) — even if metadata.estimate_id
  // were somehow spoofed to point at another tenant's estimate, this write
  // cannot cross into a company the emitting account does not own.
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
    .eq('company_id', companyId)
    .select('id, company_id, project_id, share_token, public_slug_token, currency_code')
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
      .select('email, name, stripe_account_display_name, user_id, slug')
      .eq('id', updated.company_id)
      .single(),
    svc
      .from('projects')
      .select('name')
      .eq('id', updated.project_id)
      .single(),
  ])

  const company = companyRes.data as
    | {
        email: string | null
        name: string | null
        stripe_account_display_name: string | null
        user_id: string | null
        slug: string | null
      }
    | null
  const project = projectRes.data as { name: string | null } | null

  // Phase 77 NOTIF-04: payment.received in-app + email (force channels).
  // Dedupe by Stripe event id so duplicate webhook deliveries collapse.
  try {
    const amountUSD =
      typeof session.amount_total === 'number'
        ? formatMinorUnits(session.amount_total, updated.currency_code)
        : undefined
    const ctx = {
      amountUSD,
      projectName: project?.name ?? undefined,
    }
    const copy = buildNotificationCopy('payment.received', ctx)
    void notify({
      companyId: updated.company_id,
      userId: company?.user_id ?? null,
      eventType: 'payment.received',
      title: copy.title,
      body: copy.body,
      copyContext: ctx,
      linkUrl: `/projects/${updated.project_id}/estimates/${updated.id}`,
      resourceType: 'estimate',
      resourceId: updated.id,
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: event.id },
    })

    // Phase 175 (PLAT-01) — a customer paying a tenant via Stripe Connect is a
    // platform event, DISTINCT from a tenant paying Xtimator itself
    // (subscription_payment_received in app/api/webhooks/stripe/route.ts's
    // handlePlatformEvent). Sibling, fire-and-forget — never replaces notify().
    void notifyOps({
      kind: 'tenant_payment_received',
      title: `Payment received - ${company?.name ?? 'Unknown company'}`,
      message: `${amountUSD ? `$${amountUSD}` : 'Amount unknown'} - ${project?.name ?? 'Untitled project'} - estimate ${updated.id}`,
      severity: 'warning',
      dedupeKey: `tenant_payment_received:${event.id}`,
    })
  } catch {
    /* best-effort */
  }

  const customerEmail =
    session.customer_details?.email ?? session.customer_email ?? null
  const customerName = session.customer_details?.name ?? null

  const origin = getCanonicalBaseUrl()

  // Dynamic import keeps the email module out of the hot path when no events fire.
  const { sendPaymentReceivedEmail, sendPaymentReceiptEmail } = await import(
    '@/lib/email/payment-emails'
  )

  const ctx = {
    amountCents: session.amount_total ?? 0,
    currencyCode: updated.currency_code,
    projectName: project?.name ?? 'Service estimate',
    estimateShareUrl: `${origin}${buildEstimatePublicPath(
      { slug: company?.slug ?? null, name: company?.name ?? 'Your service provider' },
      { id: updated.id, public_slug_token: updated.public_slug_token, share_token: updated.share_token, project_name: project?.name }
    )}`,
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
// invoice.paid — Phase 94 INVOICE-05 (D-20/D-21)
//
// A real Stripe Invoice issued on the connected account was paid. We match it
// to our `invoices` row by `metadata.invoice_id` (set at creation by
// createConnectInvoice in Plan 94-02), mark it paid, then reuse the existing
// payment-received + receipt emails and the payment.received in-app
// notification — repointed from the estimate to the invoice snapshot.
//
// Idempotency is handled upstream by the processed_stripe_events insert in
// app/api/webhooks/stripe/route.ts, so by the time we run the event id has
// been claimed exactly once — no extra dedup needed here.
// ------------------------------------------------------------------
async function handleInvoicePaid(
  event: Stripe.Event,
  svc: ServiceClient,
  companyId: string
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice
  const invoiceRowId = invoice.metadata?.invoice_id
  if (!invoiceRowId) {
    console.warn(
      '[stripe-webhook][connect] invoice.paid missing metadata.invoice_id'
    )
    return
  }

  // Mark the invoices row paid (service client bypasses RLS). Scoped to the
  // TRUSTED companyId (Fix 2) so a spoofed metadata.invoice_id can never write
  // into another tenant's row. Read back the snapshot fields we need for the
  // email/notification payload. This write IS the purpose of the event — a DB
  // error throws (Fix 3) so the route clears the dedup row and Stripe retries,
  // rather than silently leaving a paid invoice marked unpaid forever.
  const { data: updated, error } = await svc
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_pdf_url: invoice.invoice_pdf ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceRowId)
    .eq('company_id', companyId)
    .select(
      'id, company_id, estimate_id, amount_cents, currency_code, project_name'
    )
    .single()

  if (error) {
    throw new Error(
      `[stripe-webhook][connect] failed to mark invoice paid: ${error.message} invoiceRowId=${invoiceRowId}`
    )
  }
  if (!updated) {
    console.error(
      '[stripe-webhook][connect] failed to mark invoice paid: no matching row',
      'invoiceRowId=',
      invoiceRowId
    )
    return
  }

  // Look up company (for branding/email + notification user) and the estimate
  // (for the share-link URL) — mirrors handleCheckoutSessionCompleted's lookups.
  const [companyRes, estimateRes] = await Promise.all([
    svc
      .from('companies')
      .select('email, name, stripe_account_display_name, user_id, slug')
      .eq('id', updated.company_id)
      .single(),
    svc
      .from('estimates')
      .select('share_token, project_id, public_slug_token')
      .eq('id', updated.estimate_id)
      .single(),
  ])

  const company = companyRes.data as
    | {
        email: string | null
        name: string | null
        stripe_account_display_name: string | null
        user_id: string | null
        slug: string | null
      }
    | null
  const estimate = estimateRes.data as
    | { share_token: string | null; project_id: string | null; public_slug_token: string | null }
    | null

  // Phase 77 NOTIF-04: payment.received in-app + email (force channels).
  // Dedupe by Stripe event id so duplicate webhook deliveries collapse.
  // Amount comes from the INVOICE snapshot, never re-derived from the estimate.
  try {
    const amountUSD = formatMinorUnits(
      updated.amount_cents,
      updated.currency_code
    )
    const ctx = {
      amountUSD,
      projectName: updated.project_name ?? undefined,
    }
    const copy = buildNotificationCopy('payment.received', ctx)
    void notify({
      companyId: updated.company_id,
      userId: company?.user_id ?? null,
      eventType: 'payment.received',
      title: copy.title,
      body: copy.body,
      copyContext: ctx,
      linkUrl: estimate?.project_id
        ? `/projects/${estimate.project_id}/estimates/${updated.estimate_id}`
        : undefined,
      resourceType: 'invoice',
      resourceId: updated.id,
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: event.id },
    })

    // Phase 175 (PLAT-01) — same tenant_payment_received kind as the checkout
    // arm above (still the Connect/customer-pays-tenant path, NOT the platform
    // subscription path handled in app/api/webhooks/stripe/route.ts). Sibling,
    // fire-and-forget — never replaces notify().
    void notifyOps({
      kind: 'tenant_payment_received',
      title: `Payment received - ${company?.name ?? 'Unknown company'}`,
      message: `$${amountUSD} - ${updated.project_name ?? 'Untitled project'} - invoice ${updated.id}`,
      severity: 'warning',
      dedupeKey: `tenant_payment_received:${event.id}`,
    })
  } catch {
    /* best-effort */
  }

  // Stripe Invoice carries the customer contact directly (no Checkout session).
  const customerEmail = invoice.customer_email ?? null
  const customerName = invoice.customer_name ?? null

  const origin = getCanonicalBaseUrl()

  // Dynamic import keeps the email module out of the hot path when no events fire.
  const { sendPaymentReceivedEmail, sendPaymentReceiptEmail } = await import(
    '@/lib/email/payment-emails'
  )

  const ctx = {
    amountCents: updated.amount_cents,
    currencyCode: updated.currency_code,
    projectName: updated.project_name ?? 'Service estimate',
    estimateShareUrl: estimate?.share_token
      ? `${origin}${buildEstimatePublicPath(
          { slug: company?.slug ?? null, name: company?.name ?? 'Your service provider' },
          { id: updated.estimate_id, public_slug_token: estimate.public_slug_token, share_token: estimate.share_token, project_name: updated.project_name }
        )}`
      : origin,
    businessName:
      company?.stripe_account_display_name ??
      company?.name ??
      'Your service provider',
    businessEmail: company?.email ?? '',
    customerEmail,
    customerName,
  }

  // allSettled so a Resend failure on one doesn't block the other (the helpers
  // already swallow their own errors — belt-and-suspenders).
  await Promise.allSettled([
    sendPaymentReceivedEmail(ctx),
    sendPaymentReceiptEmail(ctx),
  ])
}

// ------------------------------------------------------------------
// invoice.voided / invoice.marked_uncollectible — mirrors handleInvoicePaid's
// row resolution by metadata.invoice_id. No emails/notifications for these
// terminal statuses (unlike invoice.paid) — best-effort, never throws.
// ------------------------------------------------------------------
async function handleInvoiceStatusChange(
  event: Stripe.Event,
  svc: ServiceClient,
  status: 'void' | 'uncollectible',
  companyId: string
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice
  const invoiceRowId = invoice.metadata?.invoice_id
  if (!invoiceRowId) {
    console.warn(
      `[stripe-webhook][connect] ${event.type} missing metadata.invoice_id`
    )
    return
  }

  // Scoped to the TRUSTED companyId (Fix 2). This status transition IS the
  // purpose of the event — throw on a DB error (Fix 3) so the route clears
  // the dedup row and Stripe retries.
  const { error } = await svc
    .from('invoices')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceRowId)
    .eq('company_id', companyId)

  if (error) {
    throw new Error(
      `[stripe-webhook][connect] failed to mark invoice ${status}: ${error.message} invoiceRowId=${invoiceRowId}`
    )
  }
}

// ------------------------------------------------------------------
// invoice.payment_failed — a payment attempt on the connected-account
// invoice failed. We deliberately leave invoices.status at 'open' (Stripe
// itself drives the eventual open → void/uncollectible transition via the
// sibling events above) but surface the failure via a warn log. No EventType
// in the notification catalog (lib/notifications/event-types.ts) fits a
// payment-failure on a tenant's customer invoice, so this is log-only —
// best-effort, never throws.
// ------------------------------------------------------------------
async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  svc: ServiceClient,
  companyId: string
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice
  const invoiceRowId = invoice.metadata?.invoice_id
  if (!invoiceRowId) {
    console.warn(
      '[stripe-webhook][connect] invoice.payment_failed missing metadata.invoice_id'
    )
    return
  }

  console.warn(
    '[stripe-webhook][connect] invoice.payment_failed — leaving invoices.status open:',
    'invoiceRowId=',
    invoiceRowId,
    'stripeInvoiceId=',
    invoice.id
  )

  // Scoped to the TRUSTED companyId (Fix 2). This touch is log-only/best-effort
  // (Stripe itself drives the open → void/uncollectible transition), so a DB
  // error here stays non-fatal — never throws.
  const { error } = await svc
    .from('invoices')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', invoiceRowId)
    .eq('company_id', companyId)

  if (error) {
    console.error(
      '[stripe-webhook][connect] invoice.payment_failed updated_at touch failed:',
      error,
      'invoiceRowId=',
      invoiceRowId
    )
  }
}

// ------------------------------------------------------------------
// charge.refunded — Phase 77 NOTIF-04 payment.refunded notification.
// We do NOT mutate invoices/estimates status here (refund handling beyond
// notification is out of scope for v1 — Stripe itself keeps a refunded
// invoice `paid`). Best-effort — failure is ignored.
// ------------------------------------------------------------------
async function handleChargeRefunded(
  event: Stripe.Event,
  svc: ServiceClient
): Promise<void> {
  // Stripe's TS types dropped Charge.invoice in favor of Invoice.payments, but
  // the webhook payload can still carry it (older/pinned API versions) — cast
  // through an intersection rather than losing Stripe.Charge's other fields.
  const charge = event.data.object as Stripe.Charge & {
    invoice?: string | Stripe.Invoice | null
  }
  const invoiceId =
    typeof charge.invoice === 'string' ? charge.invoice : (charge.invoice?.id ?? null)

  if (invoiceId) {
    await handleChargeRefundedViaInvoice(event, svc, charge, invoiceId)
    return
  }

  // Legacy pre-Phase-94 path — refunds against Checkout sessions created by
  // the removed legacy pay-route, which wrote stripe_payment_intent_id
  // directly onto `estimates` (no `invoices` row, no charge.invoice link).
  const piId = (charge.payment_intent as string | null) ?? null
  if (!piId) return

  const { data: estimate } = await svc
    .from('estimates')
    .select('id, company_id, project_id, currency_code')
    .eq('stripe_payment_intent_id', piId)
    .maybeSingle()

  const est = estimate as
    | { id: string; company_id: string; project_id: string; currency_code: string | null }
    | null
  if (!est) return

  const { data: company } = await svc
    .from('companies')
    .select('user_id')
    .eq('id', est.company_id)
    .single()

  const { data: project } = await svc
    .from('projects')
    .select('name')
    .eq('id', est.project_id)
    .single()

  const refundedCents = charge.amount_refunded ?? 0
  const amountUSD =
    typeof refundedCents === 'number'
      ? formatMinorUnits(refundedCents, est.currency_code)
      : undefined

  try {
    const ctx = {
      amountUSD,
      projectName: (project as { name?: string } | null)?.name ?? undefined,
    }
    const copy = buildNotificationCopy('payment.refunded', ctx)
    void notify({
      companyId: est.company_id,
      userId: (company as { user_id?: string | null } | null)?.user_id ?? null,
      eventType: 'payment.refunded',
      title: copy.title,
      body: copy.body,
      copyContext: ctx,
      linkUrl: `/projects/${est.project_id}/estimates/${est.id}`,
      resourceType: 'estimate',
      resourceId: est.id,
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: event.id },
    })
  } catch {
    /* best-effort */
  }
}

// ------------------------------------------------------------------
// charge.refunded — Phase 94+ path. Resolves the `invoices` row via
// charge.invoice → invoices.stripe_invoice_id and fires payment.refunded
// using the invoice snapshot's project_name (no extra estimates/projects
// lookup needed — the invoices row already carries that snapshot, mirroring
// handleInvoicePaid). Best-effort — failure is ignored.
// ------------------------------------------------------------------
async function handleChargeRefundedViaInvoice(
  event: Stripe.Event,
  svc: ServiceClient,
  charge: Stripe.Charge,
  stripeInvoiceId: string
): Promise<void> {
  const { data: invoiceRow } = await svc
    .from('invoices')
    .select('id, company_id, project_name, currency_code')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle()

  const inv = invoiceRow as
    | {
        id: string
        company_id: string
        project_name: string | null
        currency_code: string | null
      }
    | null
  if (!inv) return

  const { data: company } = await svc
    .from('companies')
    .select('user_id')
    .eq('id', inv.company_id)
    .single()

  const refundedCents = charge.amount_refunded ?? 0
  const amountUSD =
    typeof refundedCents === 'number'
      ? formatMinorUnits(refundedCents, inv.currency_code)
      : undefined

  try {
    const ctx = {
      amountUSD,
      projectName: inv.project_name ?? undefined,
    }
    const copy = buildNotificationCopy('payment.refunded', ctx)
    void notify({
      companyId: inv.company_id,
      userId: (company as { user_id?: string | null } | null)?.user_id ?? null,
      eventType: 'payment.refunded',
      title: copy.title,
      body: copy.body,
      copyContext: ctx,
      resourceType: 'invoice',
      resourceId: inv.id,
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: event.id },
    })
  } catch {
    /* best-effort */
  }
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
