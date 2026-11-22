'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getAuthContext } from '@/lib/auth/context'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { rateLimit } from '@/lib/ratelimit'

/**
 * Void an invoice the company issued on its connected Stripe account.
 *
 * The app tells owners "Void it before issuing another" when an invoice blocks a
 * new one; this is the in-app way to do that (previously only possible in the
 * company's own Stripe dashboard).
 *
 * NOT gated on the feature switches (`canIssue`, platform switch, tenant switch,
 * global stop, Stripe readiness): an owner must always be able to clean up open
 * invoices after online payments were switched off. Every other guard of
 * `issueInvoice` applies (owner, demo, paywall), all before any Stripe call.
 *
 * The Stripe webhook (`invoice.voided`) later confirms the same state on the
 * row; writing it here too makes the UI correct immediately.
 */

type VoidInvoiceResult = { error: string } | { success: true }

/** Stripe's answer when the invoice is already void (or the call raced the webhook). */
function looksAlreadyVoid(err: unknown): boolean {
  const e = err as { message?: unknown; code?: unknown } | null
  const text = `${typeof e?.code === 'string' ? e.code : ''} ${typeof e?.message === 'string' ? e.message : ''}`
  return /already[\s_-]*void/i.test(text)
}

export async function voidInvoice(invoiceId: string): Promise<VoidInvoiceResult> {
  // 1. Input.
  if (!z.string().uuid().safeParse(invoiceId).success) return { error: 'Invoice not found' }

  // 2. Auth.
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { companyId } = ctx

  // 3. Owner only.
  try {
    await requireCompanyOwner(companyId)
  } catch {
    return { error: 'Only the company owner can void invoices.' }
  }

  // 4. Demo guard + paywall.
  const sessionDenied = await assertWritable()
  if (sessionDenied) return sessionDenied
  const billingDenied = await billingEditDenied(companyId)
  if (billingDenied) return { error: billingDenied.error }

  // 5. Load the invoice (RLS-bound client) and check it belongs to the company.
  const supabase = await createClient()
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, company_id, estimate_id, change_order_id, status, stripe_invoice_id, stripe_account_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!invoice || invoice.company_id !== companyId) return { error: 'Invoice not found' }

  const targetDenied = await assertCompanyWritable(invoice.company_id as string)
  if (targetDenied) return targetDenied

  const svc = requireServiceClient()

  // 6. Status rules.
  const status = invoice.status as string
  if (status === 'paid') return { error: 'A paid invoice cannot be voided. Refund it in Stripe instead.' }
  if (status === 'void' || status === 'uncollectible') return { success: true }
  if (status === 'draft' && !invoice.stripe_invoice_id) {
    // Leftover of a failed issue: nothing exists in Stripe, so just drop the row.
    const { error: deleteError } = await svc.from('invoices').delete().eq('id', invoice.id as string)
    if (deleteError) {
      console.error('[voidInvoice] Failed to delete leftover draft row', deleteError)
      return { error: 'Could not void the invoice. Please try again.' }
    }
    await revalidateInvoicePages(supabase, invoice)
    return { success: true }
  }
  if (status !== 'open' || !invoice.stripe_invoice_id) return { error: 'Could not void the invoice. Please try again.' }

  // 7. Rate limit.
  const limit = await rateLimit('invoiceVoidPerHour', companyId)
  if (!limit.allowed) return { error: 'Too many requests. Please try again later.' }

  // 8. Connected account the invoice lives on: its own, else the company's current one.
  let stripeAccount = (invoice.stripe_account_id as string | null) ?? null
  if (!stripeAccount) {
    const { data: company } = await svc
      .from('companies')
      .select('stripe_account_id')
      .eq('id', companyId)
      .maybeSingle()
    stripeAccount = (company?.stripe_account_id as string | null) ?? null
  }
  if (!stripeAccount) {
    return {
      error:
        'This invoice was issued on a Stripe account that is no longer connected. Void it in your Stripe dashboard.',
    }
  }

  // 9. Void on the connected account (Direct Charges: request option is the THIRD arg).
  const stripeInvoiceId = invoice.stripe_invoice_id as string
  try {
    const stripe = await getStripeClient()
    await stripe.invoices.voidInvoice(stripeInvoiceId, {}, { stripeAccount, idempotencyKey: `void_${invoice.id}` })
  } catch (err) {
    let alreadyVoid = looksAlreadyVoid(err)
    if (!alreadyVoid) {
      // Second opinion: the invoice may have been voided elsewhere (Stripe dashboard).
      try {
        const stripe = await getStripeClient()
        const current = await stripe.invoices.retrieve(stripeInvoiceId, {}, { stripeAccount })
        alreadyVoid = current.status === 'void'
      } catch {
        alreadyVoid = false
      }
    }
    if (!alreadyVoid) {
      console.error('[voidInvoice] Stripe void failed', err)
      return { error: 'Could not void the invoice. Please try again.' }
    }
  }

  // 10. Record it. The invoice.voided webhook confirms the same state later.
  const { error: updateError } = await svc
    .from('invoices')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', invoice.id as string)
  if (updateError) {
    console.error('[voidInvoice] Voided in Stripe but could not update the row', updateError)
  }

  await revalidateInvoicePages(supabase, invoice)
  return { success: true }
}

/** Best-effort cache revalidation; must never break the action's return contract. */
async function revalidateInvoicePages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoice: { estimate_id?: unknown; change_order_id?: unknown },
): Promise<void> {
  try {
    const { data: estimate } = await supabase
      .from('estimates')
      .select('project_id')
      .eq('id', invoice.estimate_id as string)
      .maybeSingle()
    const projectId = (estimate as { project_id?: string | null } | null)?.project_id
    if (projectId) {
      revalidatePath(`/projects/${projectId}`)
      if (invoice.change_order_id) {
        revalidatePath(`/projects/${projectId}/change-orders/${invoice.change_order_id as string}`)
      }
    }
  } catch {
    // No request store (e.g. unit test or background context) — ignore.
  }
}
