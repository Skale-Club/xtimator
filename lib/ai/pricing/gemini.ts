// lib/ai/pricing/gemini.ts
/**
 * quick-260821 (Gemini fallback cost capture): Gemini list prices, USD per
 * 1M tokens, mirroring the shape OpenRouter already gives us for free
 * (`json.usage.cost` — see lib/ai/openrouter-client.ts). Gemini's own SDK
 * response carries no USD figure, only token counts (`usageMetadata`), so we
 * price it ourselves from Google's published rate card.
 *
 * Captured 2026-08-22 from https://ai.google.dev/gemini-api/docs/pricing
 * (Gemini Developer API, pay-as-you-go tier). Gemini 2.5 Pro is billed on a
 * two-tier prompt-length schedule (<=200k vs >200k tokens) — this table uses
 * the <=200k tier ONLY. Xtimator's estimate/vision payloads (a job-site
 * transcript + a handful of photo descriptions) are always far under that
 * threshold, so the >200k tier is intentionally not modeled here.
 *
 * Re-verify against the pricing page above if a new model is added to
 * lib/ai/providers/gemini.ts, or periodically — Google revises these rates
 * without notice.
 */
export const GEMINI_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
}

/** The subset of `GenerateContentResponse.usageMetadata` (@google/genai) this needs. */
export interface GeminiCostUsage {
  promptTokenCount?: number | null
  candidatesTokenCount?: number | null
  thoughtsTokenCount?: number | null
  toolUsePromptTokenCount?: number | null
  totalTokenCount?: number | null
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Computes the real USD cost of one Gemini call from its `usageMetadata`.
 *
 * null-vs-0 discipline (mirrors lib/billing/record-ai-cost.ts): returns null
 * — NEVER 0 — when the model has no entry in {@link GEMINI_USD_PER_MTOK}, or
 * when `usage` is missing or its token counts are not finite numbers. A null
 * return means "unknown", never a guess.
 *
 * Thinking-mode tokens (`thoughtsTokenCount`) are billed as output by Google
 * and are added to `candidatesTokenCount` here for the same reason. Result is
 * non-negative and rounded to 8 decimal places (matches ai_cost_events'
 * `real_cost_usd` numeric precision).
 */
export function computeGeminiCostUsd(
  model: string,
  usage: GeminiCostUsage | null | undefined
): number | null {
  const price = GEMINI_USD_PER_MTOK[model]
  if (!price) return null
  if (!usage) return null

  const { promptTokenCount, candidatesTokenCount, thoughtsTokenCount, toolUsePromptTokenCount, totalTokenCount } =
    usage
  if (!isNum(promptTokenCount)) return null

  const thoughts = isNum(thoughtsTokenCount) ? thoughtsTokenCount : 0
  const toolUse = isNum(toolUsePromptTokenCount) ? toolUsePromptTokenCount : 0

  // Root cause of the always-NULL production cost: with function calling
  // (and often with thinking) @google/genai OMITS `candidatesTokenCount`
  // (a functionCall part is not "candidate text") while still reporting
  // promptTokenCount / thoughtsTokenCount / totalTokenCount. totalTokenCount =
  // prompt + candidates + toolUsePrompt + thoughts, so a missing candidates
  // count is recoverable. Output (billed) = candidates + thoughts.
  let outputTokens: number
  if (isNum(candidatesTokenCount)) {
    outputTokens = candidatesTokenCount + thoughts
  } else if (isNum(totalTokenCount)) {
    outputTokens = Math.max(0, totalTokenCount - promptTokenCount - toolUse)
  } else {
    // No candidates and no total: thoughts (if any) are the only output we know.
    outputTokens = thoughts
  }

  const rawCost = (promptTokenCount * price.input + outputTokens * price.output) / 1_000_000
  return Math.round(Math.max(0, rawCost) * 1e8) / 1e8
}
