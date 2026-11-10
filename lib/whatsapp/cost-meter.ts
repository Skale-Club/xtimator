/**
 * lib/whatsapp/cost-meter.ts
 *
 * Captures the real USD cost of the LangChain (ChatOpenAI -> OpenRouter) calls the
 * WhatsApp assistant makes. LangChain does not surface OpenRouter's `usage.cost`,
 * so the OpenAI client is given a `fetch` wrapper that reads it off each JSON
 * completion response and adds it to a per-inbound-message meter. The meter is
 * settled once per message by lib/whatsapp/credits.ts (cost row + 'chat' debit).
 *
 * null vs 0 discipline: a response without a numeric cost leaves `costUsd` null
 * (never a guessed 0), so an unmetered turn records no debit.
 *
 * No server-only / heavy imports: safe to load from tests and from llm.ts.
 */

export interface WhatsAppCostMeter {
  /** Completion responses seen (an LLM call happened, with or without a cost). */
  calls: number
  /** Sum of provider-reported USD cost; null until at least one call reported one. */
  costUsd: number | null
  /** Last model slug the provider reported, for the cost row. */
  model: string | null
  /** Add one provider-reported cost; anything that is not a finite number >= 0 is ignored. */
  addCost(cost: unknown): void
}

export function createCostMeter(): WhatsAppCostMeter {
  const meter: WhatsAppCostMeter = {
    calls: 0,
    costUsd: null,
    model: null,
    addCost(cost: unknown) {
      if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
        meter.costUsd = (meter.costUsd ?? 0) + cost
      }
    },
  }
  return meter
}

/**
 * A `fetch` that forwards to `baseFetch` and, for successful JSON completions,
 * feeds `usage.cost` into `meter`. Streaming (SSE) and non-JSON responses are
 * passed through untouched (counted as a call, no cost). Never throws because of
 * metering: a parse failure just leaves the cost unknown.
 */
export function meteredFetch(
  meter: WhatsAppCostMeter,
  baseFetch: typeof fetch = (...args) => fetch(...args)
): typeof fetch {
  return async (input, init) => {
    const res = await baseFetch(input, init)
    if (!res.ok) return res
    meter.calls += 1
    try {
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const json = (await res.clone().json()) as {
          model?: unknown
          usage?: { cost?: unknown }
        }
        meter.addCost(json?.usage?.cost)
        if (typeof json?.model === 'string') meter.model = json.model
      }
    } catch {
      // Metering must never break the LLM call.
    }
    return res
  }
}
