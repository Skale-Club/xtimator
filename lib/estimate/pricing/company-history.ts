import 'server-only'
/**
 * lib/estimate/pricing/company-history.ts
 *
 * SEED-057 Phase E (decision E3): the company's OWN prices as a price source.
 *
 * When an estimate is ACCEPTED (client_response accepted/signed, never a draft
 * or a merely sent one), every priced line is filed in price_observations under
 * a (concept, unit) key (lib/estimate/pricing/concept-key.ts). At generation,
 * an item the model priced itself is re-priced to the median of the company's
 * last 10 observations of the same concept + unit and tagged
 * price_source 'company_history'.
 *
 * Precedence, one rule everywhere: price book > company history > researched >
 * model estimate. History runs AFTER price-book anchoring and BEFORE web
 * research, and research only ever touches items still tagged 'ai_estimate', so
 * a history price is never second-guessed by a web search.
 *
 * Deploy safety: every function here is best-effort and never throws. Before the
 * migration lands price_observations does not exist, the read errors, and
 * generation simply proceeds without history; recording is a silent no-op.
 *
 * Tenant scoping: companyId always comes from the trusted caller (the generation
 * param, or the estimate row's own company_id), never from model output.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateSectionOutput } from '@/lib/ai/types'
import { requireServiceClient } from '@/lib/supabase/service'
import { conceptMapKey, priceConcept } from './concept-key'

/** E3: the median of the LAST 10 observations. */
export const HISTORY_WINDOW = 10

/** One accepted job is an anecdote; two is a pattern. */
export const HISTORY_MIN_SAMPLES = 2

/**
 * A history price only replaces the model's when it is in the same ballpark (0.33x to 3x): a
 * concept key can still collide across genuinely different jobs, and a 10x gap is more likely
 * a collision than a bargain. No model price (0) leaves nothing to compare, so history wins.
 */
export const HISTORY_MIN_RATIO = 0.33
export const HISTORY_MAX_RATIO = 3

export interface HistoryPrice {
  unit_price: number
  samples: number
}

export interface ObservationRow {
  concept_key: string
  unit: string
  unit_price: number
  observed_at?: string | null
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const m = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(m * 100) / 100
}

/**
 * Group observations by (concept, unit), keep the most recent HISTORY_WINDOW of
 * each, and reduce to their median. Rows without a positive finite price are
 * ignored.
 */
export function buildHistoryIndex(rows: ObservationRow[]): Map<string, HistoryPrice> {
  const grouped = new Map<string, ObservationRow[]>()
  for (const row of rows) {
    if (!row || !(row.unit_price > 0) || !Number.isFinite(Number(row.unit_price))) continue
    const key = conceptMapKey({ key: row.concept_key, unit: row.unit ?? '' })
    const list = grouped.get(key) ?? []
    list.push(row)
    grouped.set(key, list)
  }
  const index = new Map<string, HistoryPrice>()
  for (const [key, list] of grouped) {
    const recent = list
      .slice()
      .sort((a, b) => String(b.observed_at ?? '').localeCompare(String(a.observed_at ?? '')))
      .slice(0, HISTORY_WINDOW)
    index.set(key, { unit_price: median(recent.map((r) => Number(r.unit_price))), samples: recent.length })
  }
  return index
}

/** The (concept, unit) keys of the items a history price could still apply to. */
export function historyCandidateKeys(sections: EstimateSectionOutput[]): string[] {
  const keys = new Set<string>()
  for (const section of sections) {
    for (const item of section.items) {
      if (item.price_source !== 'ai_estimate') continue
      const concept = priceConcept(item.description, item.unit)
      if (concept.key) keys.add(concept.key)
    }
  }
  return [...keys]
}

export interface HistoryApplication {
  sections: EstimateSectionOutput[]
  /** Items re-priced from company history. */
  applied: number
}

/**
 * Re-price the items still tagged 'ai_estimate' whose (concept, unit) the
 * company has priced before. price_book, researched and owner-edited items are
 * never touched. Pure.
 */
export function applyCompanyHistory(
  sections: EstimateSectionOutput[],
  index: Map<string, HistoryPrice>,
): HistoryApplication {
  if (index.size === 0) return { sections, applied: 0 }
  let applied = 0
  const next = sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (item.price_source !== 'ai_estimate') return item
      const concept = priceConcept(item.description, item.unit)
      if (!concept.key) return item
      const hit = index.get(conceptMapKey(concept))
      if (!hit || hit.samples < HISTORY_MIN_SAMPLES) return item
      const current = Number(item.unit_price)
      if (current > 0) {
        const ratio = hit.unit_price / current
        if (ratio < HISTORY_MIN_RATIO || ratio > HISTORY_MAX_RATIO) return item
      }
      applied++
      return { ...item, unit_price: hit.unit_price, price_source: 'company_history' as const }
    }),
  }))
  return applied === 0 ? { sections, applied: 0 } : { sections: next, applied }
}

/** Read the company's history for these concept keys. Never throws; any failure is "no history". */
export async function loadCompanyHistory(
  supabase: SupabaseClient,
  companyId: string,
  currency: string,
  conceptKeys: string[],
): Promise<Map<string, HistoryPrice>> {
  if (conceptKeys.length === 0) return new Map()
  try {
    const { data, error } = await supabase
      .from('price_observations')
      .select('concept_key, unit, unit_price, observed_at')
      .eq('company_id', companyId)
      .eq('currency_code', currency)
      .in('concept_key', conceptKeys)
      .order('observed_at', { ascending: false })
      .limit(Math.min(2_000, conceptKeys.length * HISTORY_WINDOW * 3))
    if (error || !Array.isArray(data)) return new Map()
    return buildHistoryIndex(data as ObservationRow[])
  } catch {
    return new Map()
  }
}

interface AcceptedItemRow {
  description: string | null
  unit: string | null
  unit_price: number | string | null
  quantity: number | string | null
}

/**
 * File the priced lines of an ACCEPTED estimate. Idempotent (one row per
 * estimate + concept + unit), never throws. Call it right after
 * client_response becomes 'accepted'.
 */
export async function recordAcceptedEstimatePrices(
  estimateId: string,
  client?: SupabaseClient,
): Promise<{ recorded: number }> {
  try {
    const supabase = client ?? requireServiceClient()
    const { data: estimate } = await supabase
      .from('estimates')
      .select('company_id, currency_code, client_response, sections:estimate_sections(items:estimate_items(description, unit, unit_price, quantity))')
      .eq('id', estimateId)
      .single()
    const row = estimate as {
      company_id: string
      currency_code: string | null
      client_response: string | null
      sections: Array<{ items: AcceptedItemRow[] | null }> | null
    } | null
    if (!row || row.client_response !== 'accepted') return { recorded: 0 }

    // One observation per (concept, unit) within the estimate: the average when
    // the same work appears twice at different prices.
    const byKey = new Map<string, { concept_key: string; unit: string; prices: number[] }>()
    for (const section of row.sections ?? []) {
      for (const item of section.items ?? []) {
        const price = Number(item.unit_price)
        const quantity = Number(item.quantity)
        if (!item.description || !(price > 0) || !(quantity > 0)) continue
        const concept = priceConcept(item.description, item.unit)
        if (!concept.key) continue
        const key = conceptMapKey(concept)
        const entry = byKey.get(key) ?? { concept_key: concept.key, unit: concept.unit, prices: [] }
        entry.prices.push(price)
        byKey.set(key, entry)
      }
    }
    const rows = [...byKey.values()].map((e) => ({
      company_id: row.company_id,
      estimate_id: estimateId,
      concept_key: e.concept_key,
      unit: e.unit,
      unit_price: Math.round((e.prices.reduce((a, b) => a + b, 0) / e.prices.length) * 100) / 100,
      currency_code: row.currency_code ?? 'USD',
      source: 'accepted_estimate' as const,
    }))
    if (rows.length === 0) return { recorded: 0 }

    const { error } = await supabase
      .from('price_observations')
      .upsert(rows, { onConflict: 'estimate_id,concept_key,unit', ignoreDuplicates: true })
    if (error) {
      // The table not existing yet (migration not applied) is the expected case.
      console.warn('[company-history] could not record price observations:', error.message)
      return { recorded: 0 }
    }
    return { recorded: rows.length }
  } catch (err) {
    console.warn('[company-history] recording failed (non-fatal):', err)
    return { recorded: 0 }
  }
}

/**
 * The owner took the acceptance back (declined or cleared): the prices were no
 * longer agreed, so they stop counting as history. Never throws.
 */
export async function forgetEstimatePrices(estimateId: string, client?: SupabaseClient): Promise<void> {
  try {
    const supabase = client ?? requireServiceClient()
    await supabase.from('price_observations').delete().eq('estimate_id', estimateId)
  } catch {
    // best-effort
  }
}
