// lib/ai/price-book-select.ts
//
// Phase 4a: pick the part of a company's price book worth showing the model for
// ONE estimate. Only the PROMPT is filtered; server-side anchoring
// (lib/ai/price-anchoring.ts) still runs against the FULL book.
//
// Pure and deterministic. No new normalizers: exact-name containment uses
// `normalizeNameForMatch` (price-anchoring) and token overlap uses `conceptKey`
// (fold + plural stem + synonym canonicalisation + stopwords).
//
//   1. ALWAYS included: entries whose normalised name appears in the source text
//      (these are what the anchoring would match, and the model must see them).
//      They are never dropped by `max`, so the result can exceed it.
//   2. Then entries sharing meaningful tokens with the source text (weight 3) or
//      with the trade playbook's vocabulary (weight 1), ranked by score, until
//      `max` is reached. Entries with no overlap are left out.
//   3. Output order: normalised name, then folder, unit, price (stable, so the
//      prompt does not shuffle between runs).
import { normalizeNameForMatch } from './price-anchoring'
import { conceptKey } from '@/lib/estimate/pricing/concept-key'
import { matchTradeLabel, PLAYBOOKS, type Playbook } from './playbooks'

export interface SelectablePriceBookItem {
  name: string
  folder_name?: string | null
  unit?: string | null
  unit_price?: number
}

export interface SelectPriceBookOptions {
  /** Transcripts + photo descriptions + prompts (+ refine instruction), untagged. */
  sourceText: string
  /** A playbook id/label (resolved with matchTradeLabel). Ignored when `playbook` is set. */
  playbookTrade?: string | null
  playbook?: Playbook
  /** Soft cap on the ranked part; exact-name matches are always kept. */
  max: number
}

const MIN_TOKEN_LENGTH = 3
const SOURCE_WEIGHT = 3
const PLAYBOOK_WEIGHT = 1

function tokens(text: string): string[] {
  return conceptKey(text)
    .split(' ')
    .filter((t) => t.length >= MIN_TOKEN_LENGTH)
}

function playbookVocabulary(playbook: Playbook): Set<string> {
  const phrases = [...playbook.keywords, ...playbook.synonyms.flat(), ...playbook.sections]
  return new Set(tokens(phrases.join(' ')))
}

function resolvePlaybookFor(opts: SelectPriceBookOptions): Playbook | null {
  if (opts.playbook) return opts.playbook
  const id = matchTradeLabel(opts.playbookTrade)
  return id ? PLAYBOOKS[id] : null
}

function compareItems(a: SelectablePriceBookItem, b: SelectablePriceBookItem): number {
  return (
    normalizeNameForMatch(a.name).localeCompare(normalizeNameForMatch(b.name)) ||
    (a.folder_name ?? '').localeCompare(b.folder_name ?? '') ||
    (a.unit ?? '').localeCompare(b.unit ?? '') ||
    (a.unit_price ?? 0) - (b.unit_price ?? 0)
  )
}

export function selectRelevantPriceBook<T extends SelectablePriceBookItem>(
  items: readonly T[],
  opts: SelectPriceBookOptions,
): T[] {
  const max = Math.max(0, Math.floor(opts.max))
  if (items.length <= max) return [...items]

  const haystack = ` ${normalizeNameForMatch(opts.sourceText)} `
  const sourceTokens = new Set(tokens(opts.sourceText))
  const playbook = resolvePlaybookFor(opts)
  const vocabulary = playbook ? playbookVocabulary(playbook) : new Set<string>()

  const exact: T[] = []
  const ranked: Array<{ item: T; score: number }> = []
  for (const item of items) {
    const name = normalizeNameForMatch(item.name)
    if (name && haystack.includes(` ${name} `)) {
      exact.push(item)
      continue
    }
    let score = 0
    for (const token of new Set(tokens(`${item.name} ${item.folder_name ?? ''}`))) {
      if (sourceTokens.has(token)) score += SOURCE_WEIGHT
      else if (vocabulary.has(token)) score += PLAYBOOK_WEIGHT
    }
    if (score > 0) ranked.push({ item, score })
  }

  ranked.sort((a, b) => b.score - a.score || compareItems(a.item, b.item))
  const room = Math.max(0, max - exact.length)
  const picked = [...exact, ...ranked.slice(0, room).map((r) => r.item)]
  return picked.sort(compareItems)
}
