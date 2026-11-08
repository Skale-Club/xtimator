/**
 * lib/ai/model-policy.ts
 *
 * Pure (no I/O, client-safe) model-policy helpers. Owner rule: every AI call goes
 * through OpenRouter and only the Claude family + Whisper are allowed.
 *
 * The two admin-editable CHAT slots (platform `ai_config.openrouter_default_model`
 * and per-company `companies.ai_model_override`) drive estimate generation, photo
 * analysis, price research, in-app chat and the WhatsApp agents, so they accept
 * Claude Sonnet / Opus only. Haiku is reserved for `OR_DEFAULTS.fast` helpers and
 * is deliberately NOT allowed here.
 */

const ALLOWED_CHAT_MODEL_PREFIXES = ['anthropic/claude-sonnet-', 'anthropic/claude-opus-'] as const

/** True when `slug` may be stored as / resolved to a chat-slot model. */
export function isAllowedChatModel(slug: unknown): slug is string {
  if (typeof slug !== 'string') return false
  const s = slug.trim()
  return ALLOWED_CHAT_MODEL_PREFIXES.some((p) => s.startsWith(p) && s.length > p.length)
}

/**
 * Read-time guard: return the stored slug when allowed, else `fallback`.
 * Used so a legacy/hand-edited disallowed value can never reach OpenRouter.
 */
export function coerceChatModel(stored: string | null | undefined, fallback: string): string {
  return isAllowedChatModel(stored) ? stored.trim() : fallback
}

export const CHAT_MODEL_POLICY_MESSAGE =
  'Only Claude Sonnet or Opus models are allowed (e.g. anthropic/claude-sonnet-5.5).'

// ---------------------------------------------------------------------------
// Per-step model slots (Phase 4c) and Opus escalation (Phase 4g)
//
// Stored in `platform_integrations.ai_config.metadata`:
//   models:     { vision?, plan?, draft?, research?, review? }
//   escalation: { enabled, minTotalUsd?, minSections?, onLowScopeConfidence?, model }
//
// EVERYTHING here is opt-in. A missing, invalid or policy-violating value means
// "today's behavior" for that call: callers pass their current default as the
// fallback and never see the bad value.
// ---------------------------------------------------------------------------

export const MODEL_SLOTS = ['vision', 'plan', 'draft', 'research', 'review'] as const
export type ModelSlot = (typeof MODEL_SLOTS)[number]
export type ModelSlots = Partial<Record<ModelSlot, string>>

const HAIKU_PREFIX = 'anthropic/claude-haiku-'
const OPUS_PREFIX = 'anthropic/claude-opus-'

/** Slots whose work is light enough for Haiku (plus Sonnet/Opus). */
const HAIKU_ELIGIBLE_SLOTS: readonly ModelSlot[] = ['vision', 'plan', 'review']

export function isHaikuModel(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.trim().startsWith(HAIKU_PREFIX) && slug.trim().length > HAIKU_PREFIX.length
}

export function isOpusModel(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.trim().startsWith(OPUS_PREFIX) && slug.trim().length > OPUS_PREFIX.length
}

/**
 * Slot policy: vision / plan / review accept Haiku, Sonnet or Opus;
 * draft / research accept Sonnet or Opus only.
 */
export function isAllowedSlotModel(slot: ModelSlot, slug: unknown): slug is string {
  if (isAllowedChatModel(slug)) return true
  return HAIKU_ELIGIBLE_SLOTS.includes(slot) && isHaikuModel(slug)
}

export function slotPolicyMessage(slot: ModelSlot): string {
  return HAIKU_ELIGIBLE_SLOTS.includes(slot)
    ? `The ${slot} step accepts Claude Haiku, Sonnet or Opus models only.`
    : `The ${slot} step accepts Claude Sonnet or Opus models only.`
}

/** Read-time guard: keep only the valid slots of a stored `models` object. */
export function parseModelSlots(raw: unknown): ModelSlots {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: ModelSlots = {}
  for (const slot of MODEL_SLOTS) {
    const v = src[slot]
    if (isAllowedSlotModel(slot, v)) out[slot] = v.trim()
  }
  return out
}

/** The slot's model when valid, else `fallback` (today's default for that call). */
export function pickSlotModel<F>(slots: ModelSlots | null | undefined, slot: ModelSlot, fallback: F): string | F {
  const v = slots?.[slot]
  return isAllowedSlotModel(slot, v) ? v.trim() : fallback
}

export interface EscalationConfig {
  enabled: true
  /** Escalate when the project's target budget (USD) is at least this. */
  minTotalUsd?: number
  /** Escalate when the two-step plan has at least this many sections. */
  minSections?: number
  /** Escalate when the two-step plan reports scope_confidence 'low'. */
  onLowScopeConfidence?: boolean
  /** Opus slug used for the draft call. */
  model: string
}

/**
 * Parse `ai_config.metadata.escalation`. Returns null (= never escalate) unless
 * `enabled === true` AND `model` is an Opus slug.
 */
export function parseEscalationConfig(raw: unknown): EscalationConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.enabled !== true) return null
  if (!isOpusModel(r.model)) return null
  const cfg: EscalationConfig = { enabled: true, model: r.model.trim() }
  if (typeof r.minTotalUsd === 'number' && Number.isFinite(r.minTotalUsd) && r.minTotalUsd > 0) {
    cfg.minTotalUsd = r.minTotalUsd
  }
  if (typeof r.minSections === 'number' && Number.isInteger(r.minSections) && r.minSections > 0) {
    cfg.minSections = r.minSections
  }
  if (r.onLowScopeConfidence === true) cfg.onLowScopeConfidence = true
  return cfg
}

/**
 * Without a two-step plan, a job counts as "large" when the transcripts and
 * prompts together reach this many characters (about 3k tokens, roughly ten
 * minutes of speech). Photo descriptions are deliberately not counted.
 */
export const ESCALATION_LARGE_JOB_CHARS = 12_000

export interface EscalationSignals {
  /** Present only when two-step planning produced a usable plan. */
  plan?: { sections: readonly unknown[]; scope_confidence?: string } | null
  /** Total characters of transcripts + prompts. */
  sourceChars: number
  /** The project's target budget in USD, when set. */
  targetBudget?: number | null
}

export interface EscalationDecision {
  escalate: boolean
  reason: string | null
}

/** Pure gate: never escalates when disabled (cfg null). */
export function decideDraftEscalation(
  cfg: EscalationConfig | null,
  s: EscalationSignals
): EscalationDecision {
  if (!cfg || cfg.enabled !== true) return { escalate: false, reason: null }
  if (cfg.minTotalUsd != null && s.targetBudget != null && s.targetBudget >= cfg.minTotalUsd) {
    return { escalate: true, reason: `target_budget>=${cfg.minTotalUsd}` }
  }
  if (s.plan) {
    if (cfg.minSections != null && s.plan.sections.length >= cfg.minSections) {
      return { escalate: true, reason: `plan_sections>=${cfg.minSections}` }
    }
    if (cfg.onLowScopeConfidence && s.plan.scope_confidence === 'low') {
      return { escalate: true, reason: 'low_scope_confidence' }
    }
    return { escalate: false, reason: null }
  }
  if (s.sourceChars >= ESCALATION_LARGE_JOB_CHARS) {
    return { escalate: true, reason: `source_chars>=${ESCALATION_LARGE_JOB_CHARS}` }
  }
  return { escalate: false, reason: null }
}
