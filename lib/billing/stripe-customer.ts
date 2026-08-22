import 'server-only'
import type Stripe from 'stripe'
import { requireServiceClient } from '@/lib/supabase/service'

type CompanyBillingRow = {
  stripe_customer_id: string | null
  name?: string | null
  email?: string | null
}

/**
 * Ensures the given company has a Stripe Customer, creating one (and
 * persisting it on `companies.stripe_customer_id`) if it doesn't.
 *
 * Historically `stripe_customer_id` was only written by the subscription
 * webhook arm — a free-tier company buying a credit top-up or setting up
 * auto-top-up never got one, so `stripe.checkout.sessions.create({ customer:
 * undefined, ... })` silently created an ORPHAN Stripe Customer with no link
 * back to the company row on every purchase, and auto-top-up could never
 * find a default payment method. Call this BEFORE creating any
 * Checkout/Portal session so `customer` is always the company's single,
 * persisted Stripe Customer id.
 *
 * Race-safe: the write is conditioned on `stripe_customer_id IS NULL`, so a
 * concurrent caller's write wins; this always re-reads afterwards and
 * returns whatever ended up persisted rather than trusting its own write. If
 * the re-read shows a DIFFERENT id than the one just created (we lost the
 * race), the just-created Customer is best-effort deleted so no orphan is
 * left behind at Stripe.
 *
 * Both reads throw on a Supabase error instead of silently treating it as
 * "no row" — swallowing a transient DB error here would create a brand-new
 * Stripe Customer for a company that may already have one, permanently
 * splitting its billing identity. Callers are route handlers, so a thrown
 * error becomes a 500, which is the correct outcome for a DB blip.
 */
export async function ensureStripeCustomer(
  stripe: Stripe,
  companyId: string
): Promise<string> {
  const svc = requireServiceClient()

  const { data: row, error: readError } = await svc
    .from('companies')
    .select('stripe_customer_id, name, email')
    .eq('id', companyId)
    .maybeSingle()

  if (readError) {
    throw new Error(
      `[ensureStripeCustomer] failed to read company ${companyId}: ${readError.message}`
    )
  }

  const company = row as CompanyBillingRow | null
  if (company?.stripe_customer_id) {
    return company.stripe_customer_id
  }

  const created = await stripe.customers.create({
    metadata: { companyId },
    email: company?.email ?? undefined,
    name: company?.name ?? undefined,
  })

  await svc
    .from('companies')
    .update({ stripe_customer_id: created.id })
    .eq('id', companyId)
    .is('stripe_customer_id', null)

  const { data: reread, error: rereadError } = await svc
    .from('companies')
    .select('stripe_customer_id')
    .eq('id', companyId)
    .maybeSingle()

  if (rereadError) {
    throw new Error(
      `[ensureStripeCustomer] failed to re-read company ${companyId} after create: ${rereadError.message}`
    )
  }

  const persisted = (reread as CompanyBillingRow | null)?.stripe_customer_id

  if (persisted && persisted !== created.id) {
    // Lost the race — a concurrent caller's write won and is now the
    // company's single source of truth. Clean up the Customer we just
    // created so it doesn't linger as an orphan at Stripe.
    try {
      await stripe.customers.del(created.id)
    } catch (e) {
      console.warn(
        `[ensureStripeCustomer] failed to delete orphaned Stripe customer ${created.id}:`,
        e
      )
    }
    return persisted
  }

  return persisted ?? created.id
}
