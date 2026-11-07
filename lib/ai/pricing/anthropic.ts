// lib/ai/pricing/anthropic.ts
/**
 * Anthropic list prices, USD per 1M tokens, mirroring lib/ai/pricing/gemini.ts.
 * The Anthropic SDK response carries no USD figure, only token counts
 * (`usage`), so the direct-Anthropic price-research adapter prices it here.
 *
 * These are LIST prices (standard tier, no batch discount) and must be
 * re-verified against https://www.anthropic.com/pricing when a model is added
 * to the adapters or periodically — Anthropic revises rates without notice.
 *
 * Model ids are matched by family PREFIX so dated ids such as
 * `claude-sonnet-4-20250514` resolve onto `claude-sonnet-4`. The longest
 * matching prefix wins (`claude-sonnet-4-5-...` -> `claude-sonnet-4-5`).
 *
 * Extras (only when present on `usage`):
 *  - prompt-cache writes (`cache_creation_input_tokens`) bill at 1.25x input
 *  - prompt-cache reads (`cache_read_input_tokens`) bill at 0.1x input
 *  - web search tool: $10 per 1,000 searches
 *    (`usage.server_tool_use.web_search_requests`)
 */
export const ANTHROPIC_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-4': { input: 15, output: 75 },
  'claude-opus-4-1': { input: 15, output: 75 },
}

export const ANTHROPIC_WEB_SEARCH_USD_PER_REQUEST = 10 / 1000
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER = 0.1

/** The subset of the Messages API `usage` object this needs. */
export interface AnthropicCostUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  server_tool_use?: { web_search_requests?: number | null } | null
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const orZero = (n: unknown): number => (isNum(n) ? n : 0)

function priceFor(model: string): { input: number; output: number } | null {
  let best: string | null = null
  for (const key of Object.keys(ANTHROPIC_USD_PER_MTOK)) {
    if ((model === key || model.startsWith(key + '-')) && (best === null || key.length > best.length)) {
      best = key
    }
  }
  return best ? ANTHROPIC_USD_PER_MTOK[best] : null
}

/**
 * Computes the real USD cost of one Anthropic Messages call from its `usage`.
 *
 * null-vs-0 discipline: returns null — NEVER 0 — for an unknown model, a
 * missing `usage`, or non-finite `input_tokens` / `output_tokens`. Result is
 * non-negative and rounded to 8 decimal places.
 */
export function computeAnthropicCostUsd(
  model: string,
  usage: AnthropicCostUsage | null | undefined
): number | null {
  const price = priceFor(model)
  if (!price) return null
  if (!usage) return null
  if (!isNum(usage.input_tokens) || !isNum(usage.output_tokens)) return null

  const cacheWrite = orZero(usage.cache_creation_input_tokens)
  const cacheRead = orZero(usage.cache_read_input_tokens)
  const searches = orZero(usage.server_tool_use?.web_search_requests)

  const tokenCost =
    (usage.input_tokens * price.input +
      cacheWrite * price.input * CACHE_WRITE_MULTIPLIER +
      cacheRead * price.input * CACHE_READ_MULTIPLIER +
      usage.output_tokens * price.output) /
    1_000_000
  const raw = tokenCost + searches * ANTHROPIC_WEB_SEARCH_USD_PER_REQUEST
  return Math.round(Math.max(0, raw) * 1e8) / 1e8
}
