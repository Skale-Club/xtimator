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
