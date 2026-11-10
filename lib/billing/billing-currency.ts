import type { TopUpPack, TierBilling } from '@/lib/billing/billing-config'
import { formatUsd } from '@/lib/billing/format-usd'

/**
 * Billing currency for Xtimator's OWN pricing (plans and credit packs) - not to
 * be confused with `estimates.currency_code`, which is what a company charges
 * ITS customers. Credits are identical in every currency; only the price
 * changes (owner decision 2026-11-09).
 *
 * Pure and client-safe (no server-only import): the billing page, the pack
 * cards, the checkout route and the auto top-up job all share these helpers so
 * the price shown is always the price charged.
 */
export type BillingCurrency = 'usd' | 'brl'

/**
 * Brazilian companies pay in BRL, everyone else in USD. `companies` has no
 * country column, so the signal is the company's own currency (`currency_code`,
 * set at onboarding from the business's country) or an explicit `country`.
 * Anything missing or unrecognised resolves to 'usd'.
 */
export function resolveBillingCurrency(
  company: { currency_code?: string | null; country?: string | null } | null | undefined,
  brlEnabled: boolean,
): BillingCurrency {
  // BRL pricing ships OFF (billing_config.brlPricingEnabled): while the flag is
  // false every company resolves to USD, exactly the pre-BRL behaviour.
  if (!brlEnabled) return 'usd'
  const currency = company?.currency_code?.trim().toUpperCase()
  if (currency === 'BRL') return 'brl'
  const country = company?.country?.trim().toUpperCase()
  if (country === 'BR' || country === 'BRA' || country === 'BRAZIL' || country === 'BRASIL') return 'brl'
  return 'usd'
}

/**
 * Price of a pack in the requested currency. A pack with no BRL price (a stored
 * config that predates BRL and matches no default) falls back to its USD price
 * AND reports 'usd', so the caller charges and displays the same currency.
 */
export function resolvePackPrice(
  pack: Pick<TopUpPack, 'priceCents' | 'priceCentsBrl'>,
  currency: BillingCurrency,
): { priceCents: number; currency: BillingCurrency } {
  if (currency === 'brl' && pack.priceCentsBrl != null && pack.priceCentsBrl > 0) {
    return { priceCents: pack.priceCentsBrl, currency: 'brl' }
  }
  return { priceCents: pack.priceCents, currency: 'usd' }
}

/** Plan price in the requested currency, with the same USD fallback as packs. */
export function resolveTierPrice(
  tier: Pick<
    TierBilling,
    | 'subscriptionPriceCents'
    | 'subscriptionPriceAnnualCents'
    | 'subscriptionPriceBrlCents'
    | 'subscriptionPriceAnnualBrlCents'
  >,
  interval: 'month' | 'year',
  currency: BillingCurrency,
): { priceCents: number; currency: BillingCurrency } {
  if (currency === 'brl') {
    const brl = interval === 'year' ? tier.subscriptionPriceAnnualBrlCents : tier.subscriptionPriceBrlCents
    if (brl != null && brl > 0) return { priceCents: brl, currency: 'brl' }
  }
  return {
    priceCents: interval === 'year' ? tier.subscriptionPriceAnnualCents : tier.subscriptionPriceCents,
    currency: 'usd',
  }
}

/** "$20" for USD, "R$ 109,90" for BRL. */
export function formatBillingAmount(cents: number, currency: BillingCurrency): string {
  if (currency === 'brl') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  }
  return formatUsd(cents)
}
