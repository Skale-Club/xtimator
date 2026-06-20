/**
 * US sales-tax auto-fill helpers.
 *
 * Used to pre-populate a company's default tax rate during onboarding from the
 * state they entered + the kind of service they run. The value is only a smart
 * default — owners can edit it anytime in Settings → Defaults.
 *
 * Data (2025–2026):
 *  - `rate` — STATE-level base sales tax rate as a decimal (no local add-ons).
 *    Source: Tax Foundation 2025 state sales tax tables. The 5 "NOMAD" states
 *    with no state sales tax (NH, OR, MT, AK, DE) are 0.
 *  - `cleaningTaxable` — whether residential/commercial cleaning (janitorial)
 *    services are subject to state sales tax. Source: ISSA (cleaning industry
 *    association) list, cross-checked with Avalara and state DOR guidance.
 *    Most states do NOT tax cleaning services; a minority do.
 *
 * NOTE: This is a starting estimate, not tax advice. Local rates and
 * service-specific rules vary — owners should confirm with their accountant.
 */

interface StateTax {
  rate: number
  cleaningTaxable: boolean
}

export const STATE_TAX: Record<string, StateTax> = {
  AL: { rate: 0.04, cleaningTaxable: false },
  AK: { rate: 0, cleaningTaxable: false },
  AZ: { rate: 0.056, cleaningTaxable: false },
  AR: { rate: 0.065, cleaningTaxable: false },
  CA: { rate: 0.0725, cleaningTaxable: false },
  CO: { rate: 0.029, cleaningTaxable: false },
  CT: { rate: 0.0635, cleaningTaxable: true },
  DE: { rate: 0, cleaningTaxable: false },
  FL: { rate: 0.06, cleaningTaxable: true },
  GA: { rate: 0.04, cleaningTaxable: false },
  HI: { rate: 0.04, cleaningTaxable: true },
  ID: { rate: 0.06, cleaningTaxable: false },
  IL: { rate: 0.0625, cleaningTaxable: false },
  IN: { rate: 0.07, cleaningTaxable: false },
  IA: { rate: 0.06, cleaningTaxable: true },
  KS: { rate: 0.065, cleaningTaxable: false },
  KY: { rate: 0.06, cleaningTaxable: true },
  LA: { rate: 0.05, cleaningTaxable: true },
  ME: { rate: 0.055, cleaningTaxable: false },
  MD: { rate: 0.06, cleaningTaxable: true },
  MA: { rate: 0.0625, cleaningTaxable: false },
  MI: { rate: 0.06, cleaningTaxable: false },
  MN: { rate: 0.06875, cleaningTaxable: true },
  MS: { rate: 0.07, cleaningTaxable: false },
  MO: { rate: 0.04225, cleaningTaxable: false },
  MT: { rate: 0, cleaningTaxable: false },
  NE: { rate: 0.055, cleaningTaxable: true },
  NV: { rate: 0.0685, cleaningTaxable: false },
  NH: { rate: 0, cleaningTaxable: false },
  NJ: { rate: 0.06625, cleaningTaxable: true },
  NM: { rate: 0.04875, cleaningTaxable: true },
  NY: { rate: 0.04, cleaningTaxable: true },
  NC: { rate: 0.0475, cleaningTaxable: false },
  ND: { rate: 0.05, cleaningTaxable: false },
  OH: { rate: 0.0575, cleaningTaxable: true },
  OK: { rate: 0.045, cleaningTaxable: false },
  OR: { rate: 0, cleaningTaxable: false },
  PA: { rate: 0.06, cleaningTaxable: true },
  RI: { rate: 0.07, cleaningTaxable: false },
  SC: { rate: 0.06, cleaningTaxable: false },
  SD: { rate: 0.042, cleaningTaxable: true },
  TN: { rate: 0.07, cleaningTaxable: false },
  TX: { rate: 0.0625, cleaningTaxable: true },
  UT: { rate: 0.061, cleaningTaxable: false },
  VT: { rate: 0.06, cleaningTaxable: false },
  VA: { rate: 0.053, cleaningTaxable: false },
  WA: { rate: 0.065, cleaningTaxable: false },
  WV: { rate: 0.06, cleaningTaxable: true },
  WI: { rate: 0.05, cleaningTaxable: false },
  WY: { rate: 0.04, cleaningTaxable: false },
  DC: { rate: 0.06, cleaningTaxable: true },
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC',
}

/** The cleaning-industry ids whose taxability follows the `cleaningTaxable` rule. */
const CLEANING_INDUSTRIES = new Set(['house_cleaning', 'upholstery_carpet_cleaning', 'cleaning'])

/** Normalize a free-text state ("ma", "MA", "Massachusetts") to a 2-letter USPS code, or null. */
export function normalizeStateCode(state: string | null | undefined): string | null {
  if (!state) return null
  const trimmed = state.trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  if (upper.length === 2 && STATE_TAX[upper]) return upper

  const byName = STATE_NAME_TO_CODE[trimmed.toLowerCase()]
  return byName ?? null
}

/**
 * Compute a smart default tax rate (decimal) from industry + state.
 *
 * - Cleaning industries → the state base rate only in states that tax cleaning
 *   services; otherwise 0.
 * - All other service industries → the state base rate (editable starting point).
 * - Returns null when the state can't be resolved, so callers can fall back to 0.
 */
export function getDefaultTaxRate(
  industry: string | null | undefined,
  state: string | null | undefined
): number | null {
  const code = normalizeStateCode(state)
  if (!code) return null

  const entry = STATE_TAX[code]
  if (!entry) return null

  if (industry && CLEANING_INDUSTRIES.has(industry)) {
    return entry.cleaningTaxable ? entry.rate : 0
  }

  return entry.rate
}
