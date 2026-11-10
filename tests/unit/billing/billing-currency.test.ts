import { describe, it, expect } from 'vitest'
import {
  resolveBillingCurrency,
  resolvePackPrice,
  resolveTierPrice,
  formatBillingAmount,
} from '@/lib/billing/billing-currency'

describe('resolveBillingCurrency', () => {
  it('flag ON: BRL company currency -> brl', () => {
    expect(resolveBillingCurrency({ currency_code: 'BRL' }, true)).toBe('brl')
    expect(resolveBillingCurrency({ currency_code: 'brl' }, true)).toBe('brl')
  })

  it('flag ON: country BR / Brazil -> brl', () => {
    expect(resolveBillingCurrency({ country: 'BR' }, true)).toBe('brl')
    expect(resolveBillingCurrency({ country: 'Brazil' }, true)).toBe('brl')
  })

  it('flag ON: US and other currencies -> usd', () => {
    expect(resolveBillingCurrency({ currency_code: 'USD' }, true)).toBe('usd')
    expect(resolveBillingCurrency({ currency_code: 'EUR' }, true)).toBe('usd')
    expect(resolveBillingCurrency({ country: 'US' }, true)).toBe('usd')
  })

  it('flag ON: missing company or fields -> usd', () => {
    expect(resolveBillingCurrency(undefined, true)).toBe('usd')
    expect(resolveBillingCurrency(null, true)).toBe('usd')
    expect(resolveBillingCurrency({}, true)).toBe('usd')
    expect(resolveBillingCurrency({ currency_code: null, country: null }, true)).toBe('usd')
  })

  it('flag OFF: a Brazilian company resolves to usd', () => {
    expect(resolveBillingCurrency({ currency_code: 'BRL' }, false)).toBe('usd')
    expect(resolveBillingCurrency({ country: 'BR' }, false)).toBe('usd')
  })
})

describe('resolvePackPrice', () => {
  const pack = { priceCents: 2000, priceCentsBrl: 10990 }

  it('returns the BRL price for brl and the USD price for usd', () => {
    expect(resolvePackPrice(pack, 'brl')).toEqual({ priceCents: 10990, currency: 'brl' })
    expect(resolvePackPrice(pack, 'usd')).toEqual({ priceCents: 2000, currency: 'usd' })
  })

  it('falls back to USD (and says so) when the pack has no BRL price', () => {
    expect(resolvePackPrice({ priceCents: 2000 }, 'brl')).toEqual({ priceCents: 2000, currency: 'usd' })
  })
})

describe('resolveTierPrice', () => {
  const pro = {
    subscriptionPriceCents: 2900,
    subscriptionPriceAnnualCents: 29000,
    subscriptionPriceBrlCents: 15990,
    subscriptionPriceAnnualBrlCents: 159900,
  }

  it('picks month/year in the requested currency', () => {
    expect(resolveTierPrice(pro, 'month', 'brl')).toEqual({ priceCents: 15990, currency: 'brl' })
    expect(resolveTierPrice(pro, 'year', 'brl')).toEqual({ priceCents: 159900, currency: 'brl' })
    expect(resolveTierPrice(pro, 'month', 'usd')).toEqual({ priceCents: 2900, currency: 'usd' })
  })

  it('falls back to USD when BRL prices are missing', () => {
    const legacy = { subscriptionPriceCents: 2900, subscriptionPriceAnnualCents: 29000 }
    expect(resolveTierPrice(legacy, 'month', 'brl')).toEqual({ priceCents: 2900, currency: 'usd' })
  })
})

describe('formatBillingAmount', () => {
  it('formats USD like formatUsd', () => {
    expect(formatBillingAmount(1000, 'usd')).toBe('$10')
  })

  it('formats BRL in pt-BR (comma decimals, R$)', () => {
    const out = formatBillingAmount(5490, 'brl').replace(/\s/g, ' ')
    expect(out).toBe('R$ 54,90')
  })
})
