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
import { randomUUID } from 'node:crypto'
import { getIntegrationKey, getOpenRouterDefaultModel } from '@/lib/platform-config'
import { createServiceClient } from '@/lib/supabase/service'
import { buildResearchSearchPrompt } from '../search-prompt'
import { priceResearchPayloadSchema } from '../schema'
import type { PriceResearchProvider, PriceResearchResult, Region, ResearchCostContext } from '../provider'
import { langfuseClient } from '@/lib/observability/langfuse'
import { recordAICost } from '@/lib/billing/record-ai-cost'

// Mirror lib/ai/providers/openrouter.ts — same base URL, same plain-fetch path.
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

// Sane default model if no platform default is configured.
const FALLBACK_MODEL = 'anthropic/claude-sonnet-4'

const MAX_SEARCH_RESULTS = 5

// AIREL-01: this is a multi-step agentic web-search call (max_results 5),
// analogous to the transcription path's 300s budget (openrouter-client.ts) —
// NOT the 120s single-completion budget. Kept local (not imported) because
// openrouter-client.ts's transcription constant is intentionally not exported
// beyond AI_CHAT_TIMEOUT_MS.
const RESEARCH_TIMEOUT_MS = 300_000

type ResearchEngine = 'exa' | 'native'

const RESEARCH_SYSTEM =
  'You are a market-price researcher. For each requested service, search the web ' +
  "for the average US market unit price in the client's city/state and return a " +
  'JSON object {results:[{name, unit_price, currency, source_url, snippet}]}. Only ' +
  'include a price when you have a real supporting source_url + snippet; omit ' +
  'ungrounded guesses.'

type UrlCitation = {
  type?: string
  /** Documented nested shape. */
  url_citation?: { url?: string; title?: string; content?: string }
  /** D4 (quick-260705-2gp): live-observed FLAT shape — fields directly on the annotation. */
  url?: string
  content?: string
}

type OpenRouterResearchResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
      annotations?: UrlCitation[]
    }
  }>
  error?: { message?: string }
  usage?: {
    server_tool_use?: { web_search_requests?: number }
    // Fix (price-research cost attribution): real upstream USD cost, returned
    // when the request carries `usage: { include: true }` — same shape as
    // lib/ai/providers/openrouter.ts's chat-completion usage block.
    cost?: number
  }
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
    async lookup(
      items,
      region: Region,
      currency,
      costContext?: ResearchCostContext
    ): Promise<PriceResearchResult[]> {
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
          // Fix (price-research cost attribution): request the real upstream
          // USD cost in the response `usage` block — mirrors COST-01's
          // `usage: { include: true }` on the estimate/vision/translation calls.
          usage: { include: true },
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
          // AIREL-01: was the ONLY unbounded fetch on this never-throw path —
          // an abort is caught by the surrounding try/catch below and degrades
          // to a research miss, same as any other network failure.
          signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        })

        if (!res.ok) return items.map((i) => missFor(i, currency))

        const json = (await res.json()) as OpenRouterResearchResponse
        if (json.error?.message) return items.map((i) => missFor(i, currency))

        // Fix (price-research cost attribution): this batched web-search call
        // spent real money regardless of how many (if any) of its items pass
        // the evidence gate below — record it ONCE per lookup() call, same
        // "record before validating" ordering as gemini.ts's structured-vision
        // path. AWAITED (not void) so the orchestrator's single, non-retrying
        // read-back can rely on this row already being committed by the time
        // lookup() resolves. null realCostUsd (never 0) only when OpenRouter's
        // usage block is absent/malformed.
        await recordAICost({
          attemptId: costContext?.attemptId ?? randomUUID(),
          operationType: 'price_research',
          provider: 'openrouter',
          model,
          realCostUsd: json.usage?.cost ?? null,
          companyId: costContext?.companyId ?? null,
          projectId: costContext?.projectId ?? null,
          units: items.length,
        })

        const message = json.choices?.[0]?.message
        const content = message?.content
        if (typeof content !== 'string') return items.map((i) => missFor(i, currency))

        // Index the real citations returned by the search tool: url -> snippet.
        // D4 (quick-260705-2gp): shape-tolerant — accepts BOTH the documented
        // nested `url_citation` object and the live-observed FLAT shape (url +
        // content directly on the annotation). A real citation must never be
        // dropped over its shape: every dropped citation nulls a source_url and
        // sends the result into the evidence gate's 100%-rejection mode.
        const citationByUrl = new Map<string, string>()
        for (const a of message?.annotations ?? []) {
          // Skip ONLY when a type is present AND differs — an absent type stays
          // tolerated (matches the previous indexer's behavior).
          if (a?.type != null && a.type !== 'url_citation') continue
          const url = a?.url_citation?.url ?? a?.url
          if (typeof url === 'string' && url.trim().length > 0) {
            citationByUrl.set(url, a?.url_citation?.content ?? a?.content ?? '')
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

        // D4 telemetry (quick-260705-2gp): the model answered but ZERO citations
        // were indexed → every source_url below gets nulled and isUsableCandidate
        // rejects 100% of results — previously a SILENT failure mode (measured at
        // a 97% evidence-gate rejection across a 100-estimate batch). Warn loudly
        // so a degraded provider / annotations shape drift is visible in the logs.
        if (parsed.data.results.length > 0 && citationByUrl.size === 0) {
          console.warn(
            `[price-research] openrouter-web: ${parsed.data.results.length} results but 0 citations indexed — annotations shape mismatch or missing; all results will fail the evidence gate`,
            {
              resultCount: parsed.data.results.length,
              annotationCount: (message?.annotations ?? []).length,
            }
          )
        }

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
