import 'server-only'
/**
 * OpenRouter-web price-research adapter — PRIMARY source (Phase 107 Plan 02 — RSRC-01).
 *
 * Issues a SEPARATE OpenRouter `/chat/completions` call carrying
 *   tools: [{ type: 'openrouter:web_search', parameters: { engine, max_results } }]
 * with no forced-tool selection and no structured estimate function tool. This is
 * deliberately decoupled from the forced structured-estimate call (per
 * .planning/research/STACK.md: forcing a custom tool AND server web-search in one
 * turn is undocumented/unreliable on OpenRouter).
 *
 * Engine is configurable between 'exa' (deterministic ~$0.005/req — the DEFAULT) and
 * 'native' (provider-determined cost), read from platform_integrations. The
 * deprecated model-suffix and legacy web-plugin request forms are intentionally avoided.
 *
 * Evidence gate (Pitfall 1): the model's self-asserted source_url is ONLY trusted
 * when it matches a real `url_citation` annotation returned by the search tool;
 * citation-less results are nulled out so isUsableCandidate (provider.ts) rejects
 * them downstream. Never throws — any failure degrades every requested item to a miss.
 *
 * Reuses getIntegrationKey('openrouter') — no new credential, no new dependency.
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import { getIntegrationKey, getOpenRouterDefaultModel } from '@/lib/platform-config'
import { createServiceClient } from '@/lib/supabase/service'
import { buildResearchSearchPrompt } from '../search-prompt'
import { priceResearchPayloadSchema } from '../schema'
import type { PriceResearchProvider, PriceResearchResult, Region } from '../provider'
import { langfuseClient } from '@/lib/observability/langfuse'

// Mirror lib/ai/providers/openrouter.ts — same base URL, same plain-fetch path.
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

// Sane default model if no platform default is configured.
const FALLBACK_MODEL = 'anthropic/claude-sonnet-4'

const MAX_SEARCH_RESULTS = 5

type ResearchEngine = 'exa' | 'native'

const RESEARCH_SYSTEM =
  'You are a market-price researcher. For each requested service, search the web ' +
  "for the average US market unit price in the client's city/state and return a " +
  'JSON object {results:[{name, unit_price, currency, source_url, snippet}]}. Only ' +
  'include a price when you have a real supporting source_url + snippet; omit ' +
  'ungrounded guesses.'

type UrlCitation = {
  type?: string
  url_citation?: { url?: string; title?: string; content?: string }
}

type OpenRouterResearchResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
      annotations?: UrlCitation[]
    }
  }>
  error?: { message?: string }
  usage?: { server_tool_use?: { web_search_requests?: number } }
}

/**
 * Resolve the configured search engine from platform_integrations.price_research
 * metadata.research_engine — mirrors getActiveResearchSource (provider.ts). Returns
 * 'native' ONLY for the literal 'native'; every other value (including unset/error)
 * falls back to 'exa', the deterministic-cost default per STACK.md.
 */
/**
 * Robustly extract the JSON `{results:[...]}` object from the model's reply.
 *
 * Web-search models (e.g. claude-sonnet-4) routinely wrap the JSON in PROSE — a
 * "Let me search…" preamble, a fenced ```json block, and a trailing "Note: …".
 * The naive "whole content is JSON" parse fails on that shape (→ every item a
 * miss), so we try, in order: (1) the inner of a fenced ```json block anywhere in
 * the text, (2) the substring from the first `{` to the last `}`, (3) the trimmed
 * whole content. Returns the first candidate that JSON.parses, else null.
 */
function extractJsonObject(content: string): unknown | null {
  const candidates: string[] = []
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fence?.[1]) candidates.push(fence[1])
  const first = content.indexOf('{')
  const last = content.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(content.slice(first, last + 1))
  candidates.push(content.trim())
  for (const c of candidates) {
    try {
      return JSON.parse(c)
    } catch {
      // try the next candidate
    }
  }
  return null
}

async function resolveEngine(): Promise<ResearchEngine> {
  try {
    const svc = createServiceClient()
    if (!svc) return 'exa'
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'price_research')
      .maybeSingle()
    const engine = (data?.metadata as { research_engine?: string } | null)?.research_engine
    return engine === 'native' ? 'native' : 'exa'
  } catch {
    return 'exa'
  }
}

export function makeOpenRouterWebProvider(): PriceResearchProvider {
  const missFor = (item: { name: string }, currency: string): PriceResearchResult => ({
    name: item.name,
    unit_price: null,
    currency,
    source_url: null,
    snippet: null,
  })

  return {
    async lookup(items, region: Region, currency): Promise<PriceResearchResult[]> {
      if (items.length === 0) return []

      const apiKey = await getIntegrationKey('openrouter')
      if (!apiKey) return items.map((i) => missFor(i, currency))

      try {
        const model = (await getOpenRouterDefaultModel()) ?? FALLBACK_MODEL
        const engine = await resolveEngine()

        const body = {
          model,
          max_tokens: 1500,
          messages: [
            { role: 'system', content: RESEARCH_SYSTEM },
            { role: 'user', content: buildResearchSearchPrompt(items, region) },
          ],
          // SEPARATE web-search call — no forced-tool selection, no estimate tool.
          tools: [
            {
              type: 'openrouter:web_search',
              parameters: { engine, max_results: MAX_SEARCH_RESULTS },
            },
          ],
        }

        const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://xtimator.com',
            'X-Title': 'Xtimator',
          },
          body: JSON.stringify(body),
        })

        if (!res.ok) return items.map((i) => missFor(i, currency))

        const json = (await res.json()) as OpenRouterResearchResponse
        if (json.error?.message) return items.map((i) => missFor(i, currency))

        const message = json.choices?.[0]?.message
        const content = message?.content
        if (typeof content !== 'string') return items.map((i) => missFor(i, currency))

        // Index the real citations returned by the search tool: url -> snippet.
        const citationByUrl = new Map<string, string>()
        for (const a of message?.annotations ?? []) {
          const url = a?.url_citation?.url
          if (typeof url === 'string' && url.trim().length > 0) {
            citationByUrl.set(url, a.url_citation?.content ?? '')
          }
        }

        // Parse the model JSON — tolerant of prose-wrapped / fenced ```json replies
        // (web-search models routinely return a preamble + fenced block + a note).
        const parsedUnknown = extractJsonObject(content)
        if (parsedUnknown == null) {
          return items.map((i) => missFor(i, currency))
        }

        // Default currency on every result before zod-validation.
        if (
          parsedUnknown &&
          typeof parsedUnknown === 'object' &&
          Array.isArray((parsedUnknown as { results?: unknown }).results)
        ) {
          for (const r of (parsedUnknown as { results: Array<Record<string, unknown>> })
            .results) {
            if (r && typeof r === 'object' && r.currency == null) r.currency = currency
          }
        }

        const parsed = priceResearchPayloadSchema.safeParse(parsedUnknown)
        if (!parsed.success) return items.map((i) => missFor(i, currency))

        // Re-associate one result per requested item, enforcing the evidence gate:
        // a self-asserted source_url is only trusted when it matches a real
        // url_citation annotation; otherwise null out source_url + snippet so
        // isUsableCandidate rejects it.
        const byName = new Map<string, PriceResearchResult>()
        for (const r of parsed.data.results) {
          const claimedUrl = r.source_url
          const cited = claimedUrl != null && citationByUrl.has(claimedUrl)
          byName.set(r.name, {
            name: r.name,
            unit_price: r.unit_price,
            currency: r.currency,
            source_url: cited ? claimedUrl : null,
            snippet: cited ? citationByUrl.get(claimedUrl!) || r.snippet : null,
            confidence: r.confidence ?? null,
          })
        }

        const out = items.map(
          (i) => byName.get(i.name) ?? missFor(i, currency)
        )

        // Best-effort observability — non-blocking, mirrors openrouter.ts.
        try {
          const gen = langfuseClient.generation({
            name: 'price_research_openrouter_web',
            model,
            input: body.messages,
            startTime: new Date(),
          })
          gen.end({
            output: { count: out.length, searches: json.usage?.server_tool_use?.web_search_requests },
            endTime: new Date(),
          })
          await langfuseClient.flushAsync()
        } catch (err) {
          console.warn('[langfuse] price-research generation trace failed:', err)
        }

        return out
      } catch {
        // Never throw — research failures degrade to misses (non-fatal contract).
        return items.map((i) => missFor(i, currency))
      }
    },
  }
}
