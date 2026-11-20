/**
 * Credit recalibration (2026-11-19): every debited operation carries its own
 * markup, so a full estimate generation can be priced as the product's unit of
 * value (~100 credits) while photos, audio, chat and messages stay cheap.
 * Client-safe (no server-only import): the admin form and the server config
 * share this list.
 *
 * credits = round(realCostUsd × markupFor(cfg, op) / creditUnitUsd)
 */
export type MarkupOp =
  | 'estimate'
  // An AI edit of an existing estimate ("Edit with AI") and a generation that
  // ended asking for more details (no estimate kept).
  | 'refine'
  | 'photo_batch'
  | 'audio_minutes'
  | 'price_research'
  | 'chat'
  | 'messaging'

export const MARKUP_OPS: readonly MarkupOp[] = [
  'estimate',
  'refine',
  'photo_batch',
  'audio_minutes',
  'price_research',
  'chat',
  'messaging',
]

type MarkupSource = {
  markup: number
  markupByOp?: Partial<Record<MarkupOp, number>> | null
}

function valid(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** The markup an operation is debited at: its own entry, else the global markup. */
export function markupFor(cfg: MarkupSource, op: MarkupOp): number {
  const own = cfg.markupByOp?.[op]
  return valid(own) ? own : cfg.markup
}

/** The debit operation a measured ai_cost_events row is charged under. */
export const COST_TO_DEBIT_OP: Record<string, MarkupOp> = {
  estimate: 'estimate',
  estimate_retry: 'estimate',
  vision: 'photo_batch',
  audio_minutes: 'audio_minutes',
  price_research: 'price_research',
  chat: 'chat',
}

/**
 * The markup a measured cost row (ai_cost_events.operation_type) is debited at.
 * A cost type that is never debited (translation) resolves to the global markup.
 */
export function markupForCostOp(cfg: MarkupSource, costOp: string): number {
  const op = COST_TO_DEBIT_OP[costOp]
  return op ? markupFor(cfg, op) : cfg.markup
}

/**
 * The lowest markup any operation is debited at. The margin invariant measures
 * a tier's grant at this value: a customer who spends every credit on the
 * cheapest-marked-up operation is the worst case for our real cost.
 */
export function lowestMarkup(cfg: MarkupSource): number {
  return Math.min(...MARKUP_OPS.map((op) => markupFor(cfg, op)))
}

/**
 * Credit recalibration 2026-11-19: what one estimate generation is charged for.
 * A run can record several model calls under its attempt ('estimate' plus
 * 'estimate_retry' rows: schema-repair re-calls, the auto-refine second pass,
 * Inngest retries). The customer pays for ONE generation, the most expensive
 * call; the platform absorbs its own retries. Unknown (null) costs are ignored;
 * all-unknown resolves to null, which never debits.
 */
export function chargeableGenerationCostUsd(costs: Array<number | null | undefined>): number | null {
  const known = costs.filter((c): c is number => typeof c === 'number' && Number.isFinite(c))
  return known.length > 0 ? Math.max(...known) : null
}
