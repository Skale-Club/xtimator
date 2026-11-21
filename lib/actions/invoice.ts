'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getAuthContext } from '@/lib/auth/context'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { createConnectInvoice } from '@/lib/billing/invoice-service'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { computeApplicationFee } from '@/lib/billing/estimate-fee'
import { resolveChargeAmount } from '@/lib/billing/charge-amount'
import { COMPANY_FEATURE_COLUMNS, resolveCompanyFeatures } from '@/lib/features/company-features'
import { getPlatformFeatureState } from '@/lib/features/platform-feature-state'
import { splitDepositBalance } from '@/lib/money/invoice-split'
import { toMinorUnits, formatMinorUnits } from '@/lib/money/currency'
import { getInvoicesByEstimateId, type InvoiceRow } from '@/lib/queries/invoice'
import { rateLimit } from '@/lib/ratelimit'
import { notifyOps } from '@/lib/observability/ops-alert'
import { resolveEstimateNumber } from '@/lib/change-orders/contract'
import { formatChangeOrderNumber } from '@/lib/change-orders/types'
import {
  planInvoice,
  type InvoiceRequest,
  type InvoicingApprovedChangeOrder,
  type InvoicingLiveInvoice,
} from '@/lib/change-orders/invoicing'

/**
 * Phase 94 (INVOICE-03 / INVOICE-06) — generate-invoice server action + read-back.
 *
 * `generateInvoice` issues a real Stripe Invoice on the company's connected
 * account and persists an immutable `invoices` snapshot row. Guard order matches
 * the Phase 70 pay route:
 *   1. auth (active company)
 *   2. estimate ownership
 *   3. demo guard — blocks ALL real Stripe side effects (Pitfall 6)
 *   4. Connect-active check (stripe_account_id + stripe_connect_status === 'active')
 *
 * Write order: a draft `invoices` row is inserted BEFORE Stripe is called, then
 * promoted to open/paid with the Stripe ids. A Stripe failure deletes the draft;
 * a failed promotion alerts ops and leaves the draft so the paid webhook can
 * still match it by metadata.invoice_id.
 *
 * The amount is snapshotted at issue time (cents, immutable). `metadata.invoice_id`
 * is the row PK so the `invoice.paid` webhook can route back to this exact row.
 *
 * Returns the discriminated `{ error }` | `{ data }` convention used across actions.
 */

const generateInvoiceSchema = z
  .object({
    kind: z.enum(['deposit', 'balance', 'full']),
    depositPct: z.number().int().min(1).max(99).optional(),
  })
  .refine((v) => v.kind === 'full' || typeof v.depositPct === 'number', {
    message: 'depositPct is required for deposit/balance invoices',
    path: ['depositPct'],
  })

export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>

/**
 * Reads back the issued invoices for an estimate (RLS-scoped to the active company).
 */
export async function getInvoicesForEstimate(
  estimateId: string,
): Promise<{ data: InvoiceRow[] } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }

  const supabase = await createClient()
  const rows = await getInvoicesByEstimateId(supabase, estimateId)
  return { data: rows }
}

type IssueInvoiceResult =
  | { data: { hostedInvoiceUrl: string | null; invoicePdfUrl: string | null } }
  | { error: string }

export async function generateInvoice(
  estimateId: string,
  opts: GenerateInvoiceInput,
): Promise<IssueInvoiceResult> {
  // Validate input early.
  const parsed = generateInvoiceSchema.safeParse(opts)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  return issueInvoice(estimateId, { kind: parsed.data.kind }, parsed.data.depositPct)
}

/**
 * Delivery 3 of XTM-CONTRACT-CO-01: bill one approved change order on its own.
 * Same guards as generateInvoice (owner, demo, Connect, client email); the
 * amount is the change order's total and the row points at it
 * (invoices.change_order_id, kind 'change_order').
 */
export async function invoiceChangeOrder(changeOrderId: string): Promise<IssueInvoiceResult> {
  if (!z.string().uuid().safeParse(changeOrderId).success) return { error: 'Change order not found' }
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { data: co } = await supabase
    .from('change_orders')
    .select('id, company_id, estimate_id')
    .eq('id', changeOrderId)
    .maybeSingle()
  if (!co || co.company_id !== ctx.companyId) return { error: 'Change order not found' }
  return issueInvoice(co.estimate_id as string, { kind: 'change_order', changeOrderId })
}

/**
 * What the owner's invoice dialog needs to preview every kind with the same
 * math the server uses (lib/change-orders/invoicing.ts). Read-only, RLS-scoped.
 */
export async function getInvoicingPreview(estimateId: string): Promise<
  | {
      data: {
        currencyCode: string
        estimateTotalCents: number
        /** True once the client accepted this estimate (invoicing before that is allowed, the dialog only says so). */
        accepted: boolean
        /** null when the estimate has no configured deposit (the dialog's percent picker applies). */
        configuredDepositCents: number | null
        approvedChangeOrders: InvoicingApprovedChangeOrder[]
        liveInvoices: InvoicingLiveInvoice[]
      }
    }
  | { error: string }
> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, company_id, currency_code, total, deposit_type, deposit_value, is_current, client_response')
    .eq('id', estimateId)
    .maybeSingle()
  if (!estimate || estimate.company_id !== ctx.companyId) return { error: 'Estimate not found' }
  const currencyCode = (estimate.currency_code as string) ?? 'USD'
  const totalDollars = Number(estimate.total) || 0
  const hasConfiguredDeposit = estimate.deposit_type === 'percent' || estimate.deposit_type === 'amount'
  const [approvedChangeOrders, live] = await Promise.all([
    loadApprovedChangeOrders(supabase, estimate, currencyCode),
    loadLiveInvoices(supabase, estimateId),
  ])
  const liveInvoices = live.invoices
  return {
    data: {
      currencyCode,
      estimateTotalCents: toMinorUnits(totalDollars, currencyCode),
      accepted: estimate.client_response === 'accepted',
      configuredDepositCents: hasConfiguredDeposit
        ? resolveChargeAmount(
            {
              total: totalDollars,
              deposit_type: estimate.deposit_type as 'percent' | 'amount',
              deposit_value: estimate.deposit_value as number | null,
            },
            currencyCode,
          ).chargeAmountCents
        : null,
      approvedChangeOrders,
      liveInvoices,
    },
  }
}

type RlsClient = Awaited<ReturnType<typeof createClient>>

/** Approved change orders count only on the accepted current estimate (the contract). */
async function loadApprovedChangeOrders(
  supabase: RlsClient,
  estimate: { id: unknown; is_current?: unknown; client_response?: unknown },
  currencyCode: string,
): Promise<InvoicingApprovedChangeOrder[]> {
  if (estimate.is_current !== true || estimate.client_response !== 'accepted') return []
  const { data } = await supabase
    .from('change_orders')
    .select('id, number, total')
    .eq('estimate_id', estimate.id as string)
    .eq('client_response', 'accepted')
    .order('number', { ascending: true })
  return ((data ?? []) as Array<{ id: string; number: number; total: number | string | null }>).map((row) => ({
    id: row.id,
    number: Number(row.number) || 0,
    totalCents: toMinorUnits(Number(row.total) || 0, currencyCode),
  }))
}

/**
 * A draft row with no Stripe invoice id is a reservation made by issueInvoice
 * while it calls Stripe. While fresh it locks out a concurrent double issue;
 * once older than this a crashed request left it behind and it must not block
 * the estimate (it is ignored here and best-effort marked void by issueInvoice;
 * it is kept, not deleted, so a late payment can still be matched to it).
 */
const STALE_DRAFT_MS = 10 * 60 * 1000

async function loadLiveInvoices(
  supabase: RlsClient,
  estimateId: string,
): Promise<{ invoices: InvoicingLiveInvoice[]; staleDraftIds: string[] }> {
  const { data } = await supabase
    .from('invoices')
    .select('id, status, amount_cents, kind, change_order_id, stripe_invoice_id, created_at')
    .eq('estimate_id', estimateId)
    .not('status', 'in', '(void,uncollectible)')
  const rows = (data ?? []) as Array<{
    id?: string | null
    status?: string | null
    amount_cents: number | null
    kind: string | null
    change_order_id: string | null
    stripe_invoice_id?: string | null
    created_at?: string | null
  }>
  const cutoff = Date.now() - STALE_DRAFT_MS
  const staleDraftIds: string[] = []
  const invoices: InvoicingLiveInvoice[] = []
  for (const row of rows) {
    const createdAt = row.created_at ? Date.parse(row.created_at) : NaN
    if (row.status === 'draft' && !row.stripe_invoice_id && Number.isFinite(createdAt) && createdAt < cutoff) {
      if (row.id) staleDraftIds.push(row.id)
      continue
    }
    invoices.push({
      kind: (row.kind ?? 'full') as InvoicingLiveInvoice['kind'],
      amount_cents: row.amount_cents ?? 0,
      change_order_id: row.change_order_id ?? null,
    })
  }
  return { invoices, staleDraftIds }
}

async function issueInvoice(
  estimateId: string,
  request: InvoiceRequest,
  depositPct?: number,
): Promise<IssueInvoiceResult> {
  const kind = request.kind
  // 1. Auth.
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { companyId } = ctx

  // 1b. Owner gate — issuing an invoice is a billing-adjacent action, so only
  //     the company owner may do it (mirrors the SEAT-02 role matrix). Role is
  //     resolved server-side from company_members; never trusted from the client.
  try {
    await requireCompanyOwner(companyId)
  } catch {
    return { error: 'Only the company owner can issue invoices.' }
  }

  const sessionDenied = await assertWritable()
  if (sessionDenied) return sessionDenied
  // A paywalled company is read-only: no new invoices (rule 2026-11-20).
  const billingDenied = await billingEditDenied(companyId)
  if (billingDenied) return { error: billingDenied.error }

  const supabase = await createClient()

  // 2. Load the estimate (auth-scoped client; RLS enforces company scope) and
  //    verify ownership against the active company.
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .select(
      'id, company_id, project_id, currency_code, total, deposit_type, deposit_value, is_current, client_response, estimate_number, estimate_seq, version, project:projects(name, client:clients(name, email))',
    )
    .eq('id', estimateId)
    .single()

  if (estimateError || !estimate) return { error: 'Estimate not found' }
  if (estimate.company_id !== companyId) return { error: 'Unauthorized' }

  // Only the current version is the contract. The dialog only offers the button
  // there, but the action is the boundary, for every kind, before any Stripe call.
  if (estimate.is_current !== true) {
    return { error: 'Only the current version of an estimate can be invoiced.' }
  }

  // 3. The estimate's persisted company is trusted after the ownership check.
  // Guard it explicitly before any Stripe or invoice persistence work.
  const targetDenied = await assertCompanyWritable(estimate.company_id)
  if (targetDenied) return targetDenied

  // 4. Connect-active check. The auth context does not carry Connect status, so
  //    read it explicitly (mirror pay route). The gate is the single feature
  //    resolver (platform switch, global stop, tenant switch, Stripe readiness),
  //    the same source of truth as the owner editor's Generate-invoice
  //    affordance, so the action and the UI can never drift.
  const { data: company } = await supabase
    .from('companies')
    .select(COMPANY_FEATURE_COLUMNS)
    .eq('id', companyId)
    .single()

  const platform = await getPlatformFeatureState()
  const payments = resolveCompanyFeatures(company, platform).onlinePayments
  if (!company || !payments.canIssue) {
    if (!payments.allowed) return { error: 'Online payments are not available for this account.' }
    if (!payments.enabled) {
      return { error: 'Turn on online payments in Settings → Client actions before issuing invoices.' }
    }
    // CONNECT-HEALTH-01: Stripe paused charges on an already-connected account.
    if (payments.restricted) {
      return {
        error:
          'Stripe has paused payments on your connected account. Finish verification in Stripe, then try again.',
      }
    }
    return { error: 'Connect a Stripe account in Settings → Client actions before issuing invoices.' }
  }

  // 4b. Rate limit (per company), after every gate and before any draft insert
  //     or Stripe call.
  const limited = await rateLimit('invoiceIssuePerHour', companyId)
  if (!limited.allowed) return { error: 'Too many invoices in a short time. Please try again later.' }
  const stripeAccountId = company.stripe_account_id as string

  // 5. Compute the snapshot amount in integer minor units.
  const currencyCode = (estimate.currency_code as string) ?? 'USD'
  const totalDollars = (estimate.total as number) ?? 0
  const totalCents = toMinorUnits(totalDollars, currencyCode)
  // DEP-02 / DEP-03: when the estimate has a server-configured deposit, the
  // deposit is the amount the payment link charges (resolveChargeAmount) and the
  // free-form depositPct is ignored, so deposit + balance always reconcile. The
  // legacy depositPct split applies only when no deposit is configured.
  const hasConfiguredDeposit =
    estimate.deposit_type === 'percent' || estimate.deposit_type === 'amount'
  const depositCents = hasConfiguredDeposit
    ? resolveChargeAmount(
        {
          total: totalDollars,
          deposit_type: estimate.deposit_type as 'percent' | 'amount',
          deposit_value: estimate.deposit_value as number | null,
        },
        currencyCode,
      ).chargeAmountCents
    : splitDepositBalance(totalDollars, currencyCode, depositPct ?? 0).depositCents

  // 5c. Contract-aware amount + overlap guards (lib/change-orders/invoicing.ts).
  // The contract is the accepted estimate plus approved change orders: the
  // balance carries the change orders not billed on their own (credits always),
  // a change order can be billed once on its own, a full invoice is only valid
  // when nothing else is live, each estimate kind is issued once, and the live
  // invoices never add up to more than the contract. Reads run AFTER the
  // owner/Connect gates above and BEFORE any Stripe call below.
  const [approvedChangeOrders, live] = await Promise.all([
    loadApprovedChangeOrders(supabase, estimate, currencyCode),
    loadLiveInvoices(supabase, estimateId),
  ])
  const liveInvoices = live.invoices
  const svc = requireServiceClient()
  if (live.staleDraftIds.length > 0) {
    // Best effort: an earlier request left these behind (see STALE_DRAFT_MS).
    // They are marked void, NOT deleted: the request may have died after Stripe
    // created and sent the invoice, and if that invoice is paid later the
    // webhook must still find this row by metadata.invoice_id. Void also frees
    // the one-live-invoice-per-change-order unique index.
    try {
      const { error: staleError } = await svc
        .from('invoices')
        .update({ status: 'void', updated_at: new Date().toISOString() })
        .in('id', live.staleDraftIds)
        .eq('company_id', companyId)
        .eq('status', 'draft')
        .is('stripe_invoice_id', null)
      if (staleError) console.error('[generateInvoice] Failed to void stale draft invoices', staleError)
    } catch (err) {
      console.error('[generateInvoice] Failed to void stale draft invoices', err)
    }
  }
  const plan = planInvoice(
    { estimateTotalCents: totalCents, depositCents, approvedChangeOrders, liveInvoices },
    request,
    (cents) => formatMinorUnits(cents, currencyCode),
  )
  if (plan.error !== undefined) return { error: plan.error }
  const amountCents = plan.amountCents
  const billedChangeOrder =
    request.kind === 'change_order'
      ? approvedChangeOrders.find((co) => co.id === request.changeOrderId) ?? null
      : null

  // 5b. Platform application fee (FEE-03). Read the live fee%/min from
  //     billing_config (never hard-coded, applied without a deploy) and compute
  //     the integer-cents fee. `amountCents` is already > 0 here, so a positive
  //     fee strictly below the charge is guaranteed except at the 1-cent edge,
  //     where computeApplicationFee returns 0 and createConnectInvoice omits it.
  //
  //     FEE-02: the Phase-70 standalone estimate checkout pay-route no longer
  //     exists (superseded by Phase-94 hosted invoices). The invoice path is the
  //     single customer-payment surface, so FEE-01 fully covers the estimate fee;
  //     subscription/top-up checkouts are platform-account charges and carry NO fee.
  //     DEP-02: `amountCents` is now the deposit-aware charged amount, so this UNCHANGED
  //     computeApplicationFee call lands the 1% fee on the deposit when one is configured
  //     (else on the grandTotal) — the fee math stays in exactly one place.
  const { estimateFeePct, estimateFeeMinCents } = await getBillingConfig()
  const applicationFeeCents = computeApplicationFee(amountCents, estimateFeePct, estimateFeeMinCents)

  // 6. Snapshot description / project name (so the invoice renders independently).
  const projectRel = (
    estimate as {
      project?: { name?: string | null; client?: { name?: string | null; email?: string | null } | null } | null
    }
  ).project
  const projectName = projectRel?.name ?? null
  const description = billedChangeOrder
    ? `${projectName ?? 'Project'} — Change order #${billedChangeOrder.number} (${formatChangeOrderNumber(
        resolveEstimateNumber(estimate as Parameters<typeof resolveEstimateNumber>[0]),
        billedChangeOrder.number,
      )})`
    : `${projectName ?? 'Estimate'} — ${kind} invoice`

  // 6b. Customer identity for the Stripe Customer (INVOICE-CUST-01). Without an
  //     email, Stripe's sendInvoice cannot email the hosted invoice to anyone, so
  //     refuse BEFORE any Stripe call rather than silently issuing an unreachable
  //     invoice.
  const customerEmail = projectRel?.client?.email ?? null
  const customerName = projectRel?.client?.name ?? null
  if (!customerEmail) {
    return { error: "Add an email address to this project's client before issuing an invoice." }
  }

  // 7. Customer reuse (D-14): reuse the most recent prior customer id for this
  //    estimate, but ONLY one created on the SAME connected account. A Stripe
  //    customer exists inside one account, so after the company connected a
  //    different account an old id would be rejected by Stripe. Rows issued
  //    before invoices.stripe_account_id existed have it null; we cannot know
  //    whether the company ever changed account since, so null is treated as
  //    "do not reuse" and a fresh customer is created. Degrades to a fresh
  //    customer when no prior row is readable.
  let existingCustomerId: string | null = null
  try {
    const { data: priors } = await supabase
      .from('invoices')
      .select('stripe_customer_id, stripe_account_id')
      .eq('estimate_id', estimateId)
      .eq('stripe_account_id', stripeAccountId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    const prior = (priors ?? []).find(
      (row: { stripe_customer_id: string | null; stripe_account_id: string | null }) =>
        !!row.stripe_customer_id && row.stripe_account_id === stripeAccountId,
    )
    existingCustomerId = prior?.stripe_customer_id ?? null
  } catch {
    existingCustomerId = null
  }

  // 8. Pre-generate the row id so it can route the webhook via metadata.invoice_id.
  const invoiceRowId = crypto.randomUUID()

  // 9. Reserve the row FIRST as a draft (service role: tenants have SELECT only
  //    on `invoices`). If this fails nothing exists in Stripe. The draft also
  //    locks out a concurrent double issue, and gives the paid webhook a row to
  //    find even if the final update below fails.
  const { error: draftError } = await svc.from('invoices').insert({
    id: invoiceRowId,
    estimate_id: estimateId,
    company_id: companyId,
    kind,
    change_order_id: billedChangeOrder?.id ?? null,
    amount_cents: amountCents,
    currency_code: currencyCode,
    project_name: projectName,
    description,
    status: 'draft',
    stripe_account_id: stripeAccountId,
    stripe_invoice_id: null,
    stripe_customer_id: null,
    hosted_invoice_url: null,
    invoice_pdf_url: null,
  })
  if (draftError) {
    console.error('[generateInvoice] Failed to reserve invoice row', draftError)
    return { error: 'Failed to create the invoice. Please try again.' }
  }

  // 10. Issue the real Stripe Invoice on the connected account.
  let stripeResult: Awaited<ReturnType<typeof createConnectInvoice>>
  try {
    stripeResult = await createConnectInvoice({
      stripeAccountId,
      customerEmail,
      customerName,
      existingCustomerId,
      amountCents,
      currencyCode,
      description,
      metadata: { invoice_id: invoiceRowId, company_id: companyId },
      daysUntilDue: 7,
      // INVOICE-IDEMPOTENCY-01: keyed on the freshly generated row id (unique
      // per issue), NOT `${estimateId}_${kind}` — the old key was stable across
      // every re-issue of the same kind, so a re-issue within Stripe's 24h
      // idempotency window either 400'd on mismatched params or replayed the
      // same invoice back, tripping the `stripe_invoice_id` unique constraint.
      idempotencyBase: `inv_${invoiceRowId}`,
      applicationFeeCents,
    })
  } catch (err) {
    console.error('[generateInvoice] Stripe invoice creation failed', err)
    // Release the reservation. If this fails the stale-draft rule frees the
    // estimate after STALE_DRAFT_MS.
    try {
      const { error: deleteError } = await svc
        .from('invoices')
        .delete()
        .eq('id', invoiceRowId)
        .eq('company_id', companyId)
      if (deleteError) console.error('[generateInvoice] Failed to delete draft invoice row', deleteError)
    } catch (deleteErr) {
      console.error('[generateInvoice] Failed to delete draft invoice row', deleteErr)
    }
    return { error: 'Failed to create the invoice. Please try again.' }
  }

  // 11. Promote the draft with the Stripe result (service role). One retry; if
  //     it still fails the row stays a draft carrying the right id, so the paid
  //     webhook can still find it, and ops is alerted.
  const finalFields = {
    status: stripeResult.status === 'paid' ? 'paid' : 'open',
    stripe_invoice_id: stripeResult.stripeInvoiceId,
    stripe_customer_id: stripeResult.stripeCustomerId,
    hosted_invoice_url: stripeResult.hostedInvoiceUrl,
    invoice_pdf_url: stripeResult.invoicePdfUrl,
    updated_at: new Date().toISOString(),
  }
  let saveError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await svc
        .from('invoices')
        .update(finalFields)
        .eq('id', invoiceRowId)
        .eq('company_id', companyId)
      saveError = error ?? null
    } catch (err) {
      saveError = err
    }
    if (!saveError) break
  }
  if (saveError) {
    console.error('[generateInvoice] Failed to persist invoice row', saveError)
    void notifyOps({
      kind: 'invoice_row_save_failed',
      title: 'Stripe invoice created but not saved',
      message: `invoice row ${invoiceRowId} (stripe ${stripeResult.stripeInvoiceId}) was created on the connected account but the row could not be updated; it stays a draft`,
      severity: 'error',
      dedupeKey: `invoice_row_save_failed:${invoiceRowId}`,
    })
    return { error: 'Invoice was created in Stripe but could not be saved. Please contact support.' }
  }

  // Best-effort cache revalidation — must not break the action's return contract
  // when invoked outside a request/static-generation context.
  try {
    const projectId = (estimate as { project_id?: string | null }).project_id
    if (projectId) {
      revalidatePath(`/projects/${projectId}`)
      if (billedChangeOrder) revalidatePath(`/projects/${projectId}/change-orders/${billedChangeOrder.id}`)
    }
  } catch {
    // No request store (e.g. unit test or background context) — ignore.
  }

  return {
    data: {
      hostedInvoiceUrl: stripeResult.hostedInvoiceUrl,
      invoicePdfUrl: stripeResult.invoicePdfUrl,
    },
  }
}
