// lib/estimate/presentation-settings.ts
// PRESENT-01..05: the ONE place that decides (a) section visibility and
// (b) estimate-scoped tax/discount/deposit OVERRIDE STATE. Pure -- no DB
// calls, no side effects. Malformed/absent input degrades to defaults,
// never throws (mirrors the totals engine's isTaxConfig() discipline).

export type SectionKey =
  | 'summary'
  | 'sections'        // Line Sections / Scope Details
  | 'payment_terms'
  | 'timeline'
  | 'warranty_terms'
  | 'notes'
  | 'photos'

export interface SectionVisibility {
  summary?: boolean
  sections?: boolean
  payment_terms?: boolean
  timeline?: boolean
  warranty_terms?: boolean
  notes?: boolean
  photos?: boolean
}

/** Tax override state. 'default' = use company tax_config/default_tax_rate
 *  unchanged. 'custom' = use customRate. 'off' = enabled:false but originalRate
 *  is PRESERVED (never mutated to 0) so re-enabling restores the exact value --
 *  this is the CONTEXT.md-locked "Tax Off never mutates tax_rate=0" contract. */
export interface TaxOverride {
  mode: 'default' | 'custom' | 'off'
  customRate?: number | null
  /** The rate to restore when toggling OFF back to 'default'/'custom'. Captured
   *  at the moment 'off' is first set; never itself mutated by the 'off' state. */
  preservedRate?: number | null
}

export interface DiscountOverride {
  enabled: boolean
  type?: 'amount' | 'percent' | null
  value?: number | null
}

export interface DepositOverride {
  enabled: boolean
  type?: 'amount' | 'percent' | null
  value?: number | null
}

/** Raw shape persisted in estimates.presentation_settings (all fields optional --
 *  a partial/legacy object is valid input to resolvePresentationSettings). */
export interface PresentationSettings {
  sections?: SectionVisibility
  tax?: TaxOverride
  discount?: DiscountOverride
  deposit?: DepositOverride
}

/** Fully-defaulted, safe-to-read shape returned by resolvePresentationSettings.
 *  Every key is guaranteed present -- no renderer needs `?? true` fallbacks. */
export interface ResolvedPresentationSettings {
  sections: Required<SectionVisibility>
  tax: TaxOverride
  discount: DiscountOverride
  deposit: DepositOverride
}

const DEFAULT_SECTION_VISIBILITY: Required<SectionVisibility> = {
  summary: true,
  sections: true,
  payment_terms: true,
  timeline: true,
  warranty_terms: true,
  notes: true,
  photos: true,
}

const DEFAULT_TAX_OVERRIDE: TaxOverride = { mode: 'default' }
const DEFAULT_DISCOUNT_OVERRIDE: DiscountOverride = { enabled: false }
const DEFAULT_DEPOSIT_OVERRIDE: DepositOverride = { enabled: false }

/**
 * Type guard + defaults-fill, mirroring isTaxConfig()'s degrade-safely
 * discipline. NULL / undefined / malformed input -> full defaults (= today's
 * behavior, everything visible, no overrides). A PARTIAL object (e.g. only
 * `sections.summary: false` set) fills every other key from defaults --
 * never throws, never returns `undefined` keys.
 */
export function resolvePresentationSettings(
  raw: unknown
): ResolvedPresentationSettings {
  const value = isPlainObject(raw) ? (raw as PresentationSettings) : {}

  return {
    sections: { ...DEFAULT_SECTION_VISIBILITY, ...(isPlainObject(value.sections) ? value.sections : {}) },
    tax: isValidTaxOverride(value.tax) ? { ...DEFAULT_TAX_OVERRIDE, ...value.tax } : DEFAULT_TAX_OVERRIDE,
    discount: isPlainObject(value.discount) ? { ...DEFAULT_DISCOUNT_OVERRIDE, ...value.discount } : DEFAULT_DISCOUNT_OVERRIDE,
    deposit: isPlainObject(value.deposit) ? { ...DEFAULT_DEPOSIT_OVERRIDE, ...value.deposit } : DEFAULT_DEPOSIT_OVERRIDE,
  }
}

/** The ONE predicate every renderer must call instead of `field != null` (PRESENT-04). */
export function isSectionVisible(
  settings: ResolvedPresentationSettings,
  section: SectionKey
): boolean {
  return settings.sections[section] !== false // absent/true -> visible; only explicit false hides
}

/**
 * PRESENT-05: the ONE shared predicate for "has a client already seen this
 * estimate" -- reuses the existing denormalized sent_at/viewed_at columns,
 * no new tracking infrastructure. UI notice rendering is Phase 162's job;
 * this phase only makes the signal resolvable and shared (no drift).
 */
export function hasEstimateBeenSentOrViewed(estimate: {
  sent_at: string | null
  viewed_at: string | null
}): boolean {
  return estimate.sent_at != null || estimate.viewed_at != null
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isValidTaxOverride(v: unknown): v is TaxOverride {
  return isPlainObject(v) && (v.mode === 'default' || v.mode === 'custom' || v.mode === 'off')
}
