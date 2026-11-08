/**
 * lib/estimate/pricing/price-bands.ts
 *
 * Phase 4e (plan section 6): price sanity helpers behind ESTIMATOR_PRICE_BANDS
 * (default OFF). Pure, no I/O, never throws.
 *
 *   - isPriceBandsEnabled(): the flag, read at CALL time (same pattern as
 *     ESTIMATOR_TWO_STEP in lib/ai/scope-plan.ts).
 *   - withinRatioBand(): the 0.33x to 3x sanity band between a model price and a
 *     second opinion (researched price). Same band as company history
 *     (HISTORY_MIN_RATIO / HISTORY_MAX_RATIO in company-history.ts, asserted equal
 *     by a test; duplicated here because that module is server-only).
 *   - USD <-> currency conversion with a SMALL STATIC, APPROXIMATE table. It exists
 *     only to scale absurdity ceilings and playbook price bands for non-USD
 *     estimates. It is NOT an exchange-rate feed and must never be used to convert
 *     a price the client sees.
 *   - playbook band lookup (findPlaybookBand / priceOutsideBand).
 */
import type { Playbook } from '@/lib/ai/playbooks/types'
import { unitKey } from '@/lib/ai/units'

/** ESTIMATOR_PRICE_BANDS, read at call time. Default OFF. */
export function isPriceBandsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ESTIMATOR_PRICE_BANDS?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on' || v === 'yes'
}

/** Same band as company history (0.33x to 3x of the model price). */
export const BAND_MIN_RATIO = 0.33
export const BAND_MAX_RATIO = 3

/**
 * True when `candidate` is within 0.33x..3x of `modelPrice`. A model price that is not a
 * positive finite number has nothing to compare against, so the candidate passes (a $0 line is
 * the unpriced ladder's business, not the band's). A non-positive candidate never passes.
 */
export function withinRatioBand(modelPrice: number, candidate: number): boolean {
  if (!(typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0)) return false
  if (!(typeof modelPrice === 'number' && Number.isFinite(modelPrice) && modelPrice > 0)) return true
  const ratio = candidate / modelPrice
  // epsilon: 3.3 / 10 is 0.32999999999999996, and the band is inclusive.
  return ratio >= BAND_MIN_RATIO - 1e-9 && ratio <= BAND_MAX_RATIO + 1e-9
}

/**
 * APPROXIMATE units of currency per 1 USD, for the currencies in
 * lib/money/currency.ts SUPPORTED_CURRENCIES. Rough, static, deliberately coarse: it scales
 * absurdity ceilings and playbook bands, nothing else. Review yearly; a test asserts every
 * supported currency has an entry.
 */
export const APPROX_UNITS_PER_USD: Record<string, number> = {
  USD: 1,
  BRL: 5.5,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.37,
  AUD: 1.5,
  MXN: 18,
  CHF: 0.88,
  JPY: 150,
  NZD: 1.65,
}

/** Approximate amount of `usd` in `currencyCode`. Unknown or USD currency returns `usd` unchanged. */
export function usdToCurrencyApprox(usd: number, currencyCode: string | null | undefined): number {
  const rate = APPROX_UNITS_PER_USD[(currencyCode ?? 'USD').toUpperCase()]
  if (!rate || rate === 1) return usd
  return Math.round(usd * rate)
}

/**
 * A USD absurdity ceiling expressed in the estimate's currency. Flag-aware: with
 * ESTIMATOR_PRICE_BANDS off (or a USD estimate) the USD number is returned untouched, so today's
 * behavior is byte-identical.
 */
export function ceilingInCurrency(
  usdCeiling: number,
  currencyCode: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): number {
  if (!isPriceBandsEnabled(env)) return usdCeiling
  return usdToCurrencyApprox(usdCeiling, currencyCode)
}

export interface BandHit {
  concept: string
  unit: string
  /** Band in the ESTIMATE's currency (converted from the USD band). */
  min: number
  max: number
}

/**
 * The playbook band that applies to a line, or null: the first `priceBands` concept whose `match`
 * words appear in the description AND that has a band for the line's unit (canonical unit key).
 * Bands are written in USD and scaled to `currencyCode` with the approximate table.
 */
export function findPlaybookBand(
  playbook: Pick<Playbook, 'priceBands'> | null | undefined,
  description: string,
  unit: string | null | undefined,
  currencyCode: string | null | undefined = 'USD',
): BandHit | null {
  const bands = playbook?.priceBands
  if (!bands || bands.length === 0) return null
  const u = unitKey(unit)
  if (!u) return null
  const text = (description ?? '').toLowerCase()
  for (const b of bands) {
    if (!b.match.some((w) => text.includes(w.toLowerCase()))) continue
    for (const [bandUnit, range] of Object.entries(b.bands)) {
      if (unitKey(bandUnit) !== u) continue
      const [lo, hi] = range
      return {
        concept: b.concept,
        unit: u,
        min: usdToCurrencyApprox(lo, currencyCode),
        max: usdToCurrencyApprox(hi, currencyCode),
      }
    }
  }
  return null
}

/**
 * The band a priced line falls OUTSIDE of, or null (inside, no band, or an unpriced line). Only
 * lines the model or the web research priced are checked: price book and company history are
 * the owner's own numbers and are never second-guessed.
 */
export function priceOutsideBand(
  playbook: Pick<Playbook, 'priceBands'> | null | undefined,
  item: { description: string; unit?: string | null; unit_price: number; price_source?: string | null },
  currencyCode: string | null | undefined = 'USD',
): BandHit | null {
  if (item.price_source === 'price_book' || item.price_source === 'company_history') return null
  const price = Number(item.unit_price)
  if (!(Number.isFinite(price) && price > 0)) return null
  const band = findPlaybookBand(playbook, item.description, item.unit, currencyCode)
  if (!band) return null
  return price < band.min || price > band.max ? band : null
}
