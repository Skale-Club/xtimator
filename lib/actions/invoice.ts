'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getAuthContext } from '@/lib/auth/context'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { createConnectInvoice } from '@/lib/billing/invoice-service'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { computeApplicationFee } from '@/lib/billing/estimate-fee'
import { resolveChargeAmount } from '@/lib/billing/charge-amount'
import { paymentsEnabled } from '@/lib/billing/payments-enabled'
import { splitDepositBalance } from '@/lib/money/invoice-split'
import { toMinorUnits, formatMinorUnits } from '@/lib/money/currency'
import { getInvoicesByEstimateId, type InvoiceRow } from '@/lib/queries/invoice'

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

export async function generateInvoice(
  estimateId: string,
  opts: GenerateInvoiceInput,
): Promise<{ data: { hostedInvoiceUrl: string | null; invoicePdfUrl: string | null } } | { error: string }> {
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

  // Validate input early.
  const parsed = generateInvoiceSchema.safeParse(opts)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { kind, depositPct } = parsed.data

  const supabase = await createClient()

  // 2. Load the estimate (auth-scoped client; RLS enforces company scope) and
  //    verify ownership against the active company.
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .select(
      'id, company_id, project_id, currency_code, total, deposit_type, deposit_value, project:projects(name, client:clients(name, email))',
    )
    .eq('id', estimateId)
    .single()

  if (estimateError || !estimate) return { error: 'Estimate not found' }
  if (estimate.company_id !== companyId) return { error: 'Unauthorized' }

  // 3. The estimate's persisted company is trusted after the ownership check.
  // Guard it explicitly before any Stripe or invoice persistence work.
  const targetDenied = await assertCompanyWritable(estimate.company_id)
  if (targetDenied) return targetDenied

  // 4. Connect-active check. The auth context does not carry Connect status, so
  //    read it explicitly (mirror pay route). The gate calls the single
  //    `paymentsEnabled` predicate (PAYGATE-01) — same source of truth as the
  //    owner editor's Generate-invoice affordance, so the action and the UI can
  //    never drift on what "payments are on" means.
  const { data: company } = await supabase
    .from('companies')
    .select('stripe_account_id, stripe_connect_status, stripe_charges_enabled')
    .eq('id', companyId)
    .single()

  if (!company || !paymentsEnabled(company)) {
    // CONNECT-HEALTH-01 (Fix 1): distinguish "Stripe paused charges on an
    // already-connected account" (actionable — go finish verification) from
    // "never connected / disconnected" (go connect). Both states fail the same
    // `paymentsEnabled` predicate, but they need different guidance.
    if (company?.stripe_account_id && company.stripe_charges_enabled === false) {
      return {
        error:
          'Stripe has paused payments on your connected account. Finish verification in Stripe, then try again.',
      }
    }
    return { error: 'Connect a Stripe account in Settings → Payments before issuing invoices.' }
  }

  // 5. Compute the snapshot amount in integer minor units.
  const currencyCode = (estimate.currency_code as string) ?? 'USD'
  const totalDollars = (estimate.total as number) ?? 0
  const totalCents = toMinorUnits(totalDollars, currencyCode)
  // DEP-02: when the estimate has a server-configured deposit, the deposit is the amount the
  // payment link charges (resolveChargeAmount). Falls back to the legacy depositPct split when
  // no deposit is configured on the estimate (backward-compatible with the Phase-94 ad-hoc UI).
  const hasConfiguredDeposit =
    estimate.deposit_type === 'percent' || estimate.deposit_type === 'amount'
  let amountCents: number
  if (kind === 'full') {
    amountCents = totalCents
  } else if (hasConfiguredDeposit) {
    // DEP-03: when the estimate has a server-configured deposit, BOTH the
    // deposit and balance invoices derive from resolveChargeAmount so they
    // always sum to the total — the free-form depositPct is ignored entirely
    // (it only drives the legacy ad-hoc split below when no deposit exists).
    const depositCents = resolveChargeAmount(
      {
        total: totalDollars,
        deposit_type: estimate.deposit_type as 'percent' | 'amount',
        deposit_value: estimate.deposit_value as number | null,
      },
      currencyCode,
    ).chargeAmountCents
    amountCents = kind === 'deposit' ? depositCents : totalCents - depositCents
  } else {
    const split = splitDepositBalance(totalDollars, currencyCode, depositPct ?? 0)
    amountCents = kind === 'deposit' ? split.depositCents : split.balanceCents
  }
  if (amountCents <= 0) return { error: 'Invalid amount' }

  // 5c. Overlap guard (Fix 2): an estimate can otherwise be invoiced beyond its
  // total across multiple issues. Reads every non-void/non-uncollectible
  // invoice already issued for this estimate (RLS-scoped) — AFTER the
  // owner/Connect gates above, BEFORE any Stripe call below. A `full` invoice
  // is rejected outright when ANY other active invoice already exists (it is
  // never valid to "fully" invoice on top of something already issued); every
  // kind is additionally rejected once the running total would exceed the
  // estimate's total.
  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('status, amount_cents, kind')
    .eq('estimate_id', estimateId)
    .not('status', 'in', '(void,uncollectible)')

  const activeInvoices = (existingInvoices ?? []) as {
    status: string
    amount_cents: number | null
    kind: string | null
  }[]

  if (kind === 'full' && activeInvoices.length > 0) {
    return {
      error:
        'This estimate already has an invoice issued. Void the existing invoice before issuing a new full invoice.',
    }
  }

  // Per-KIND uniqueness. The sum guard below is not enough on its own: with a
  // 40% deposit, issuing `deposit` twice sums to 80% ≤ 100% and passes, leaving
  // the customer two payable deposit invoices AND blocking the real balance.
  if (activeInvoices.some((inv) => inv.kind === kind)) {
    return {
      error: `A ${kind} invoice has already been issued for this estimate. Void it before issuing another.`,
    }
  }

  const alreadyInvoicedCents = activeInvoices.reduce(
    (sum, inv) => sum + (inv.amount_cents ?? 0),
    0,
  )
  if (alreadyInvoicedCents + amountCents > totalCents) {
    return {
      error: `This estimate is already fully invoiced (${formatMinorUnits(alreadyInvoicedCents, currencyCode)} of ${formatMinorUnits(totalCents, currencyCode)} already invoiced).`,
    }
  }

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
  const description = `${projectName ?? 'Estimate'} — ${kind} invoice`

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
  //    estimate when present. Guarded so an insert-only client doesn't break the
  //    happy path — degrades to a fresh customer when no prior row is readable.
  let existingCustomerId: string | null = null
  try {
    const { data: priors } = await supabase
      .from('invoices')
      .select('stripe_customer_id')
      .eq('estimate_id', estimateId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    existingCustomerId = priors?.[0]?.stripe_customer_id ?? null
  } catch {
    existingCustomerId = null
  }

  // 8. Pre-generate the row id so it can route the webhook via metadata.invoice_id
  //    BEFORE the row is inserted (single insert keeps the snapshot immutable).
  const invoiceRowId = crypto.randomUUID()

  // 9. Issue the real Stripe Invoice on the connected account.
  let stripeResult: Awaited<ReturnType<typeof createConnectInvoice>>
  try {
    stripeResult = await createConnectInvoice({
      stripeAccountId: company.stripe_account_id,
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
    return { error: 'Failed to create the invoice. Please try again.' }
  }

  // 10. Persist the immutable snapshot row (single insert with the Stripe result).
  //     Financial rows are written server-side only — the tenant INSERT/UPDATE
  //     RLS policies on `invoices` are gone, so this MUST go through the service
  //     role. The ownership check in step 2/3 already scoped this action to the
  //     caller's company; the SELECT read-back above stays on the RLS client.
  const svc = requireServiceClient()
  const { data: row, error: insertError } = await svc
    .from('invoices')
    .insert({
      id: invoiceRowId,
      estimate_id: estimateId,
      company_id: companyId,
      kind,
      amount_cents: amountCents,
      currency_code: currencyCode,
      project_name: projectName,
      description,
      status: stripeResult.status === 'paid' ? 'paid' : 'open',
      stripe_invoice_id: stripeResult.stripeInvoiceId,
      stripe_customer_id: stripeResult.stripeCustomerId,
      hosted_invoice_url: stripeResult.hostedInvoiceUrl,
      invoice_pdf_url: stripeResult.invoicePdfUrl,
    })
    .select('id, hosted_invoice_url, invoice_pdf_url')
    .single()

  if (insertError || !row) {
    console.error('[generateInvoice] Failed to persist invoice row', insertError)
    return { error: 'Invoice was created in Stripe but could not be saved. Please contact support.' }
  }

  // Best-effort cache revalidation — must not break the action's return contract
  // when invoked outside a request/static-generation context.
  try {
    const projectId = (estimate as { project_id?: string | null }).project_id
    if (projectId) revalidatePath(`/projects/${projectId}`)
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
