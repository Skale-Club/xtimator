'use server'

import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { revalidatePath } from 'next/cache'

/**
 * Phase 153 (CREDITUI-07) — tenant-facing auto-top-up settings actions.
 *
 * Mirrors lib/actions/settings.ts's getAuthContext pattern. The
 * payment-method-exists + pack-index-range checks here are NOT optional
 * client-side niceties — CONTEXT.md and research Pitfall 2 both flag this
 * as the server-side guard that prevents a company from ending up
 * enabled-but-unchargeable (client bypass, or a payment method later
 * detached in the Stripe Dashboard).
 */
async function getAuthContext(): Promise<
  { error: string } | { companyId: string }
> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  const denied = await assertWritable()
  if (denied) return denied

  return { companyId: activeCompanyId }
}

export async function saveAutoTopupSettings(input: {
  thresholdCredits: number
  packIndex: number
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return ctx

  const cfg = await getBillingConfig()
  if (!cfg.autoTopupEnabled) {
    return { error: 'Auto top-up is not available right now.' }
  }

  if (!Number.isInteger(input.thresholdCredits) || input.thresholdCredits <= 0) {
    return { error: 'Enter a valid threshold amount.' }
  }
  if (!Number.isInteger(input.packIndex) || !cfg.topUpPacks[input.packIndex]) {
    return { error: 'Invalid top-up pack selected.' }
  }

  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('stripe_customer_id')
    .eq('id', ctx.companyId)
    .maybeSingle()

  const stripeCustomerId = (company as { stripe_customer_id?: string | null } | null)?.stripe_customer_id
  if (!stripeCustomerId) {
    return { error: 'Add a payment method before enabling auto top-up.' }
  }

  // Pitfall 2 — verify server-side, independent of any client claim, that a
  // default payment method actually exists before persisting enabled: true.
  const stripe = await getStripeClient()
  const customer = (await stripe.customers.retrieve(stripeCustomerId, {
    expand: ['invoice_settings.default_payment_method'],
  })) as unknown as { invoice_settings?: { default_payment_method?: unknown } }
  if (!customer.invoice_settings?.default_payment_method) {
    return { error: 'Add a payment method before enabling auto top-up.' }
  }

  const { error } = await svc
    .from('companies')
    .update({
      auto_topup_enabled: true,
      auto_topup_threshold_credits: input.thresholdCredits,
      auto_topup_pack_index: input.packIndex,
    })
    .eq('id', ctx.companyId)

  if (error) return { error: 'Could not save auto top-up settings. Please try again.' }

  revalidatePath('/settings/billing')
  return { success: true }
}

export async function disableAutoTopup(): Promise<{ success: true } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return ctx

  const svc = requireServiceClient()
  const { error } = await svc
    .from('companies')
    .update({ auto_topup_enabled: false })
    .eq('id', ctx.companyId)

  if (error) return { error: 'Could not turn off auto top-up. Please try again.' }

  revalidatePath('/settings/billing')
  return { success: true }
}
