// lib/ai/playbooks/index.ts
//
// SEED-057 Phase B: the playbook registry and the trade resolver.
//
// resolvePlaybook picks ONE playbook per generation, in this order:
//   1. an explicit trade (the plan_scope pre-pass, Phase C)
//   2. a confident keyword read of the source material (what was actually asked
//      for beats the company's configured industry, same rule as the prompt's
//      "estimate the work that is actually requested")
//   3. project_type, then company.industry
//   4. the general playbook
import { cleaning } from './cleaning'
import { painting } from './painting'
import { landscaping } from './landscaping'
import { plumbing } from './plumbing'
import { electrical } from './electrical'
import { hvac } from './hvac'
import { roofing } from './roofing'
import { remodel } from './remodel'
import { general } from './general'
import type { Playbook, PlaybookId } from './types'

export type { Playbook, PlaybookId, MandatoryLine, PriceBand } from './types'

export const PLAYBOOKS: Record<PlaybookId, Playbook> = {
  cleaning,
  painting,
  landscaping,
  plumbing,
  electrical,
  hvac,
  roofing,
  remodel,
  general,
}

/** Specific trades first: a tie goes to the earlier (more specific) one. */
const TRADE_ORDER: PlaybookId[] = [
  'cleaning',
  'painting',
  'landscaping',
  'plumbing',
  'electrical',
  'hvac',
  'roofing',
  'remodel',
]

export const PLAYBOOK_IDS = [...TRADE_ORDER, 'general'] as const

export function getPlaybook(id: PlaybookId): Playbook {
  return PLAYBOOKS[id]
}

export function isPlaybookId(value: unknown): value is PlaybookId {
  return typeof value === 'string' && value in PLAYBOOKS
}

/** Lowercase and strip accents so "Pintura"/"fiacao" match regardless of typing. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const keywordRegexCache = new Map<string, RegExp>()

/** A keyword matches at a word START ("paint" matches "painting", not "repaint"... which has its own entry). */
function keywordRegex(keyword: string): RegExp {
  let re = keywordRegexCache.get(keyword)
  if (!re) {
    re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(fold(keyword))}`)
    keywordRegexCache.set(keyword, re)
  }
  return re
}

/** How many distinct keywords of each trade appear in `text`. */
function keywordScores(text: string): Array<{ id: PlaybookId; score: number }> {
  const folded = fold(text)
  return TRADE_ORDER.map((id) => ({
    id,
    score: PLAYBOOKS[id].keywords.filter((k) => keywordRegex(k).test(folded)).length,
  }))
}

const MAX_SCAN_CHARS = 12_000

/**
 * A trade from free text, or null when the signal is weak. Needs at least two
 * distinct keyword hits AND a lead of at least one over the runner-up, so one
 * stray word ("panel", "deck") never flips the playbook.
 */
export function detectTradeFromText(text: string): PlaybookId | null {
  if (!text.trim()) return null
  const scores = keywordScores(text.slice(0, MAX_SCAN_CHARS)).sort((a, b) => b.score - a.score)
  const [best, second] = scores
  if (!best || best.score < 2) return null
  if (second && best.score - second.score < 1) return null
  return best.id
}

/**
 * A playbook for a configured trade label (company.industry, project_type,
 * detected_trade): the id itself, an alias, or a keyword. "General" and unknown
 * labels carry no signal and return null.
 */
export function matchTradeLabel(label: string | null | undefined): PlaybookId | null {
  if (!label) return null
  const folded = fold(label).trim()
  if (!folded || folded === 'general') return null
  if (isPlaybookId(folded) && folded !== 'general') return folded
  let best: { id: PlaybookId; score: number } | null = null
  for (const id of TRADE_ORDER) {
    const pb = PLAYBOOKS[id]
    let score = 0
    for (const alias of pb.aliases) {
      const a = fold(alias)
      if (folded === a) score += 3
      else if (folded.includes(a) || a.includes(folded)) score += 2
    }
    for (const keyword of pb.keywords) {
      if (keywordRegex(keyword).test(folded)) score += 1
    }
    if (score > 0 && (!best || score > best.score)) best = { id, score }
  }
  return best?.id ?? null
}

export interface TradeSignals {
  /** Explicit trade, e.g. from the plan_scope pre-pass. */
  detectedTrade?: string | null
  industry?: string | null
  projectType?: string | null
  /** The source material (transcripts, descriptions, prompts), untagged. */
  text?: string
}

export function resolvePlaybook(signals: TradeSignals): Playbook {
  const explicit = matchTradeLabel(signals.detectedTrade)
  if (explicit) return PLAYBOOKS[explicit]
  const fromText = signals.text ? detectTradeFromText(signals.text) : null
  if (fromText) return PLAYBOOKS[fromText]
  const fromType = matchTradeLabel(signals.projectType)
  if (fromType) return PLAYBOOKS[fromType]
  const fromIndustry = matchTradeLabel(signals.industry)
  if (fromIndustry) return PLAYBOOKS[fromIndustry]
  return PLAYBOOKS.general
}
