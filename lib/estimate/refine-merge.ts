// lib/estimate/refine-merge.ts
//
// Phase 170 Plan 01 (REFINE-01/02, audit § G): the ONE pure merge/diff util
// shared by the refine review dialog (preview) AND the reducer's
// APPLY_REFINEMENT (apply) — what the user reviews is exactly what lands.
//
// Closes audit G2 (APPLY_REFINEMENT regenerated EVERY section/item id as
// temp-, 100% row churn + created_at reset on the next save) and G3 (no
// review-before-apply). The refined payload (RefinementPayload) carries NO
// ids — only content — so identity is recovered by MATCHING refined items
// back onto the CURRENT editor rows.
//
// Matching is TWO-PASS per section (Blocker-1 fix): a refine's whole purpose
// is often to REWORD a line, and a naive description-only match would
// classify that exact row as remove+add and LOSE its id/created_at — the
// opposite of what this util exists to prevent.
//   Pass 1 — exact normalized-description match: verbatim-untouched rows,
//            reorders, and price/qty-only changes. Reuses the current id.
//   Pass 2 — positional pairing of the LEFTOVERS (section-relative index),
//            guarded by a token-overlap similarity threshold so a genuine
//            replace isn't force-matched onto an unrelated id. A pair that
//            clears the guard is a MODIFICATION (desc changed) -> reuse the
//            current id, preserve created_at, emit as `changed`. Below the
//            guard -> removed (current) + added (refined), not paired.
// Remaining unmatched refined items = added (temp- id).
// Remaining unmatched current items = removed (dropped).
//
// Sections match by normalized title, single-pass (a refine rewording a
// SECTION title is far rarer than rewording a line, and out of scope for v1).

import type { EditorItem, EditorSection, RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RefineDiff {
  changed: Array<{ description: string; oldPrice: number; newPrice: number; oldQty: number; newQty: number }>
  added: Array<{ description: string; unit_price: number }>
  removed: Array<{ description: string }>
  // Warning 2: narrative-only refines change ZERO line items — without these a
  // "make the summary more professional" refine would render an EMPTY diff and
  // the user would Discard a real change. Field-level flags so the review is
  // never empty for a narrative-only refine.
  fields: {
    summary?: { old: string; new: string }
    notes?: boolean
    timeline?: boolean
    payment_terms?: boolean
    warranty_terms?: boolean
  }
}

export interface MergeCurrentContent {
  sections: EditorSection[]
  summary: string | null
  notes?: string | null
  timeline?: string | null
  payment_terms?: string | null
  warranty_terms?: string | null
}

type RefinedItem = RefinementPayload['sections'][number]['items'][number]

// ---------------------------------------------------------------------------
// Normalization + similarity helpers
// ---------------------------------------------------------------------------

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Info 6 / test (j): compare at cent precision — avoids fp noise (200.00000001). */
function priceEquals(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

function fieldChanged(cur: string | null | undefined, next: string | null | undefined): boolean {
  return (cur ?? null) !== (next ?? null)
}

/**
 * Token-overlap (Jaccard) similarity in [0, 1]. Used ONLY as pass-2's guard
 * (test k: a genuine replace — zero word overlap — must NOT be force-paired
 * onto an unrelated id). A short/cheap heuristic is enough here: pass-2 only
 * ever runs over the LEFTOVERS of a section (already description-deduped by
 * pass 1), which in practice is a small set.
 */
function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeText(b).split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let intersection = 0
  for (const t of ta) if (tb.has(t)) intersection++
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : intersection / union
}

/** Below this, a pass-2 leftover pair is treated as an unrelated replace
 *  (removed+added) rather than a reworded match. Calibrated so a rewording
 *  that keeps the bulk of its words (test h) clears it, and a swap to an
 *  unrelated line (test k) does not. */
const SIMILARITY_THRESHOLD = 0.25

// ---------------------------------------------------------------------------
// Item-level merge for ONE matched section
// ---------------------------------------------------------------------------

function buildMergedItem(
  id: string,
  r: RefinedItem,
  sortOrder: number,
  isManuallyEdited: boolean
): EditorItem {
  return {
    id,
    description: r.description,
    quantity: r.quantity,
    unit: r.unit ?? null,
    unit_price: r.unit_price,
    total: Math.round(r.quantity * r.unit_price * 100) / 100 - (r.discount ?? 0),
    sort_order: sortOrder,
    price_source: r.price_source,
    isManuallyEdited,
    // v4.11 advanced pricing — same no-op-default cast pattern the pre-existing
    // APPLY_REFINEMENT used (refined value ?? default); preserved verbatim.
    taxable: r.taxable ?? true,
    tax_category: r.tax_category ?? null,
    discount: r.discount ?? 0,
    cost: r.cost ?? null,
    markup_pct: r.markup_pct ?? null,
  }
}

function mergeSectionItems(
  currentItems: EditorItem[],
  refinedItems: RefinedItem[]
): {
  items: EditorItem[]
  changed: RefineDiff['changed']
  added: RefineDiff['added']
  removed: RefineDiff['removed']
} {
  const claimedCurrent = new Set<number>()
  const claimedRefined = new Set<number>()
  const pairs = new Map<number, number>() // refinedIdx -> currentIdx

  // Pass 1 — exact normalized-description match (case/space-insensitive).
  for (let ci = 0; ci < currentItems.length; ci++) {
    const normDesc = normalizeText(currentItems[ci].description)
    for (let ri = 0; ri < refinedItems.length; ri++) {
      if (claimedRefined.has(ri)) continue
      if (normalizeText(refinedItems[ri].description) === normDesc) {
        claimedCurrent.add(ci)
        claimedRefined.add(ri)
        pairs.set(ri, ci)
        break
      }
    }
  }

  // Pass 2 — positional pairing of the LEFTOVERS, guarded by similarity.
  const leftoverCurrent = currentItems.map((_, i) => i).filter((i) => !claimedCurrent.has(i))
  const leftoverRefined = refinedItems.map((_, i) => i).filter((i) => !claimedRefined.has(i))
  const pairCount = Math.min(leftoverCurrent.length, leftoverRefined.length)
  for (let k = 0; k < pairCount; k++) {
    const ci = leftoverCurrent[k]
    const ri = leftoverRefined[k]
    const sim = tokenSimilarity(currentItems[ci].description, refinedItems[ri].description)
    if (sim >= SIMILARITY_THRESHOLD) {
      claimedCurrent.add(ci)
      claimedRefined.add(ri)
      pairs.set(ri, ci)
    }
    // Below the guard: leave both unclaimed -> falls through to removed+added.
  }

  const changed: RefineDiff['changed'] = []
  const added: RefineDiff['added'] = []
  const removed: RefineDiff['removed'] = []
  const items: EditorItem[] = []

  for (let ri = 0; ri < refinedItems.length; ri++) {
    const r = refinedItems[ri]
    const ci = pairs.get(ri)
    if (ci !== undefined) {
      const cur = currentItems[ci]
      const priceChanged = !priceEquals(cur.unit_price, r.unit_price)
      const qtyChanged = cur.quantity !== r.quantity
      const descChanged = normalizeText(cur.description) !== normalizeText(r.description)
      if (priceChanged || qtyChanged || descChanged) {
        changed.push({
          description: r.description,
          oldPrice: cur.unit_price,
          newPrice: r.unit_price,
          oldQty: cur.quantity,
          newQty: r.quantity,
        })
      }
      // Info 6 (test j): the AI echoed the price back unchanged -> don't
      // silently un-pin a manual price it didn't touch. Only a genuine price
      // delta resets the manual-override flag.
      const isManuallyEdited = priceChanged ? false : (cur.isManuallyEdited ?? false)
      items.push(buildMergedItem(cur.id, r, items.length, isManuallyEdited))
    } else {
      added.push({ description: r.description, unit_price: r.unit_price })
      items.push(buildMergedItem('temp-' + crypto.randomUUID(), r, items.length, false))
    }
  }

  for (let ci = 0; ci < currentItems.length; ci++) {
    if (!claimedCurrent.has(ci)) {
      removed.push({ description: currentItems[ci].description })
    }
  }

  return { items, changed, added, removed }
}

function sectionSubtotal(items: EditorItem[]): number {
  return items.reduce((sum, i) => sum + i.total, 0)
}

// ---------------------------------------------------------------------------
// mergeRefinement
// ---------------------------------------------------------------------------

export function mergeRefinement(
  current: MergeCurrentContent,
  refined: RefinementPayload
): { mergedSections: EditorSection[]; diff: RefineDiff } {
  const claimedCurrentSections = new Set<number>()
  const claimedRefinedSections = new Set<number>()
  const sectionPairs = new Map<number, number>() // refinedIdx -> currentIdx

  for (let ci = 0; ci < current.sections.length; ci++) {
    const normTitle = normalizeText(current.sections[ci].title)
    for (let ri = 0; ri < refined.sections.length; ri++) {
      if (claimedRefinedSections.has(ri)) continue
      if (normalizeText(refined.sections[ri].title) === normTitle) {
        claimedCurrentSections.add(ci)
        claimedRefinedSections.add(ri)
        sectionPairs.set(ri, ci)
        break
      }
    }
  }

  const changed: RefineDiff['changed'] = []
  const added: RefineDiff['added'] = []
  const removed: RefineDiff['removed'] = []
  const mergedSections: EditorSection[] = []

  for (let ri = 0; ri < refined.sections.length; ri++) {
    const rSection = refined.sections[ri]
    const ci = sectionPairs.get(ri)
    if (ci !== undefined) {
      const cSection = current.sections[ci]
      const merged = mergeSectionItems(cSection.items, rSection.items)
      changed.push(...merged.changed)
      added.push(...merged.added)
      removed.push(...merged.removed)
      mergedSections.push({
        id: cSection.id,
        title: rSection.title,
        sort_order: mergedSections.length,
        subtotal: sectionSubtotal(merged.items),
        items: merged.items,
      })
    } else {
      // Unmatched refined section = all-new (temp- section id); every item is added.
      const items = rSection.items.map((r, idx) => {
        added.push({ description: r.description, unit_price: r.unit_price })
        return buildMergedItem('temp-' + crypto.randomUUID(), r, idx, false)
      })
      mergedSections.push({
        id: 'temp-' + crypto.randomUUID(),
        title: rSection.title,
        sort_order: mergedSections.length,
        subtotal: sectionSubtotal(items),
        items,
      })
    }
  }

  // Unmatched CURRENT sections dropped entirely by the refine -> every item removed.
  for (let ci = 0; ci < current.sections.length; ci++) {
    if (!claimedCurrentSections.has(ci)) {
      for (const item of current.sections[ci].items) {
        removed.push({ description: item.description })
      }
    }
  }

  const fields: RefineDiff['fields'] = {}
  if (fieldChanged(current.summary, refined.summary)) {
    fields.summary = { old: current.summary ?? '', new: refined.summary ?? '' }
  }
  if (fieldChanged(current.notes, refined.notes)) fields.notes = true
  if (fieldChanged(current.timeline, refined.timeline)) fields.timeline = true
  if (fieldChanged(current.payment_terms, refined.payment_terms)) fields.payment_terms = true
  if (fieldChanged(current.warranty_terms, refined.warranty_terms)) fields.warranty_terms = true

  return { mergedSections, diff: { changed, added, removed, fields } }
}
