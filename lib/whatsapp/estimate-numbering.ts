/**
 * lib/whatsapp/estimate-numbering.ts
 *
 * Stable display-numbering for WhatsApp estimate edit commands (Phase 51
 * follow-up: section/item-level edits). This module is the SINGLE documented
 * home for the ordering invariant so the numbers the owner SEES in the
 * `awaiting_confirm` confirmation equal the numbers the agent's edit tools
 * RESOLVE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ORDERING INVARIANT (single source of truth)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sections are numbered 1..N by `sort_order` ASC; items within a section are
 * numbered N.1..N.M by `sort_order` ASC. This MUST equal the estimate-rendering
 * order used everywhere the estimate is displayed:
 *   - lib/queries/estimate.ts  fetchEstimateWithSections()
 *       .order('sort_order')                          // sections
 *       .order('sort_order', { foreignTable: 'estimate_items' })  // items
 *   - lib/queries/share.ts     (public share page)  — same sort_order ordering
 *   - lib/mcp/tools/read.ts    (MCP read tool)      — same sort_order ordering
 *
 * The DB ordering column is `sort_order` on BOTH `estimate_sections` and
 * `estimate_items`. Because the numbers rendered here and the numbers resolved
 * here derive from the SAME sort, "item 2.3" always maps to the exact
 * estimate_items row a client would render third under the second section.
 *
 * Determinism: rows are sorted in JS (not relying on PostgREST embed order) so
 * the numbering is identical regardless of how the row set arrives. A tie on
 * `sort_order` (should not occur in practice) breaks to `id` ASC so numbering
 * stays deterministic — never ambiguous.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatMoney } from '@/lib/money/currency'

// ---------------------------------------------------------------------------
// Raw row shapes (as returned by the untyped service client — every field is
// optional/nullable because the numbering must never throw on a sparse row).
// ---------------------------------------------------------------------------

export type RawItemRow = {
  id?: string | null
  description?: string | null
  quantity?: number | null
  unit?: string | null
  unit_price?: number | null
  total?: number | null
  sort_order?: number | null
}

export type RawSectionRow = {
  id?: string | null
  title?: string | null
  subtotal?: number | null
  sort_order?: number | null
  items?: RawItemRow[] | null
}

// ---------------------------------------------------------------------------
// Numbered shapes (post-sort, with the 1-based display numbers assigned).
// ---------------------------------------------------------------------------

export type NumberedItem = {
  itemNumber: number
  id: string | null
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
}

export type NumberedSection = {
  sectionNumber: number
  id: string | null
  title: string
  subtotal: number
  items: NumberedItem[]
}

export type NumberedEstimate = {
  total: number
  currencyCode: string
  sections: NumberedSection[]
}

function bySortOrder(
  a: { sort_order?: number | null; id?: string | null },
  b: { sort_order?: number | null; id?: string | null }
): number {
  const ao = typeof a.sort_order === 'number' ? a.sort_order : 0
  const bo = typeof b.sort_order === 'number' ? b.sort_order : 0
  if (ao !== bo) return ao - bo
  return String(a.id ?? '').localeCompare(String(b.id ?? ''))
}

/**
 * Apply the ordering invariant to raw section/item rows: sort by `sort_order`
 * (id tiebreak) and assign 1-based section + item numbers. Pure — no DB access.
 */
export function numberSections(
  rawSections: RawSectionRow[] | null | undefined
): NumberedSection[] {
  const sections = [...(rawSections ?? [])].sort(bySortOrder)
  return sections.map((section, sIdx) => {
    const items = [...(section.items ?? [])].sort(bySortOrder)
    return {
      sectionNumber: sIdx + 1,
      id: section.id ?? null,
      title: section.title ?? '',
      subtotal: Number(section.subtotal ?? 0),
      items: items.map((item, iIdx) => ({
        itemNumber: iIdx + 1,
        id: item.id ?? null,
        description: item.description ?? '',
        quantity: Number(item.quantity ?? 0),
        unit: item.unit ?? null,
        unit_price: Number(item.unit_price ?? 0),
        total: Number(item.total ?? 0),
      })),
    }
  })
}

/**
 * Fetch an estimate's sections + items and return them numbered per the
 * ordering invariant. Ordering is applied in JS (numberSections), so no
 * `.order()` is chained on the query — the row set can arrive in any order.
 */
export async function getNumberedEstimate(
  supabase: SupabaseClient,
  estimateId: string
): Promise<NumberedEstimate | null> {
  const { data } = await supabase
    .from('estimates')
    .select(
      'total, currency_code, sections:estimate_sections(id, title, subtotal, sort_order, items:estimate_items(id, description, quantity, unit, unit_price, total, sort_order))'
    )
    .eq('id', estimateId)
    .single()

  if (!data) return null
  const row = data as {
    total?: number | null
    currency_code?: string | null
    sections?: RawSectionRow[] | null
  }
  return {
    total: Number(row.total ?? 0),
    currencyCode: row.currency_code ?? 'USD',
    sections: numberSections(row.sections),
  }
}

/**
 * Compact numbered breakdown for a WhatsApp bubble. Sections read
 * "1. Title — $X"; items read "   1.2 Description (x3) — $Y" (quantity shown
 * only when > 1). Kept terse so it fits a phone bubble. Returns '' when there
 * are no sections.
 */
export function buildNumberedBreakdownLines(
  sections: NumberedSection[],
  currencyCode: string
): string {
  const money = (n: number) => formatMoney(n, currencyCode)
  const lines: string[] = []
  for (const section of sections) {
    lines.push(`${section.sectionNumber}. ${section.title} — ${money(section.subtotal)}`)
    for (const item of section.items) {
      const label = item.description || 'Item'
      const qty = item.quantity > 1 ? ` (x${item.quantity})` : ''
      lines.push(
        `   ${section.sectionNumber}.${item.itemNumber} ${label}${qty} — ${money(item.total)}`
      )
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Reference resolution N -> section, N.M -> item.
// ---------------------------------------------------------------------------

export type ResolveItemResult =
  | { ok: true; section: NumberedSection; item: NumberedItem }
  | { ok: false; error: string }

export type ResolveSectionResult =
  | { ok: true; section: NumberedSection }
  | { ok: false; error: string }

/** Resolve a section number (1-based) to its numbered section. */
export function resolveSection(
  sections: NumberedSection[],
  sectionNumber: number
): ResolveSectionResult {
  const section = sections.find((s) => s.sectionNumber === sectionNumber)
  if (!section) {
    const n = sections.length
    return {
      ok: false,
      error: `Section ${sectionNumber} doesn't exist — the estimate has ${n} section${n === 1 ? '' : 's'}.`,
    }
  }
  return { ok: true, section }
}

/** Resolve an "N.M" reference to the exact numbered item. */
export function resolveItem(
  sections: NumberedSection[],
  sectionNumber: number,
  itemNumber: number
): ResolveItemResult {
  const sectionRes = resolveSection(sections, sectionNumber)
  if (!sectionRes.ok) return { ok: false, error: sectionRes.error }
  const section = sectionRes.section
  const item = section.items.find((i) => i.itemNumber === itemNumber)
  if (!item) {
    const m = section.items.length
    return {
      ok: false,
      error: `Item ${sectionNumber}.${itemNumber} doesn't exist — section ${sectionNumber} (${section.title}) has ${m} item${m === 1 ? '' : 's'}.`,
    }
  }
  return { ok: true, section, item }
}
