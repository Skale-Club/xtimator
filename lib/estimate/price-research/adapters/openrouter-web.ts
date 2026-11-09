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
import { getOpenRouterDefaultModel } from '@/lib/platform-config'
import { resolveOpenRouterKey } from '@/lib/ai/openrouter-client'
import { createServiceClient } from '@/lib/supabase/service'
import { buildResearchSearchPrompt, buildResearchSystemPrompt } from '../search-prompt'
import { priceResearchPayloadSchema } from '../schema'
import type {
  LookupDiagnostics,
  PriceResearchProvider,
  PriceResearchResult,
  Region,
  ResearchCostContext,
} from '../provider'
import { OR_DEFAULTS } from '@/lib/ai/openrouter-client'
import { resolveSlotModel } from '@/lib/ai/step-models'
import { isAllowedChatModel } from '@/lib/ai/model-policy'
import { langfuseClient } from '@/lib/observability/langfuse'
import { recordAICost } from '@/lib/billing/record-ai-cost'

// Mirror lib/ai/providers/openrouter.ts — same base URL, same plain-fetch path.
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

// Sane default model if no platform default is configured.
const FALLBACK_MODEL = OR_DEFAULTS.chat

const MAX_SEARCH_RESULTS = 5

// AIREL-01: this is a multi-step agentic web-search call (max_results 5),
// analogous to the transcription path's 300s budget (openrouter-client.ts) —
// NOT the 120s single-completion budget. Kept local (not imported) because
// openrouter-client.ts's transcription constant is intentionally not exported
// beyond AI_CHAT_TIMEOUT_MS.
const RESEARCH_TIMEOUT_MS = 300_000

type ResearchEngine = 'exa' | 'native'

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
 * Web-search models (e.g. claude-sonnet) routinely wrap the JSON in PROSE — a
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

/** Loose comparison key for a name: lowercase, punctuation/spacing collapsed. */
function looseNameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Normalized form of a URL for citation matching: lowercased host without a leading `www.`
 * plus the pathname without trailing slashes. Protocol, query and fragment are ignored. An
 * unparseable (or non-http) URL yields null and never matches.
 */
function normalizeCitationUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const host = u.host.toLowerCase().replace(/^www\./, '')
    if (!host) return null
    return `${host}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
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

      // Diagnostics: reported once on every exit path after the HTTP request was attempted.
      const diag: LookupDiagnostics = {
        requested: items.length,
        httpOk: false,
        parsed: false,
        returned: 0,
        matched: 0,
        matchedLoosely: 0,
        citations: 0,
        cited: 0,
        citedLoosely: 0,
      }
      let attempted = false
      let reported = false
      const report = () => {
        if (reported) return
        reported = true
        try {
          costContext?.onUsage?.({ diagnostics: { ...diag } })
        } catch {
          // observability only
        }
      }

      // Phase 3 (D3): a BYOK company's own OpenRouter key runs its research
      // too; no company context (or a missing key) -> platform key / miss.
      let apiKey: string
      try {
        apiKey = (await resolveOpenRouterKey(costContext?.companyId)).apiKey
      } catch {
        return items.map((i) => missFor(i, currency))
      }

      try {
        // Slot `research` (admin, Sonnet/Opus) wins; else the platform default, else Sonnet.
        const researchSlot = await resolveSlotModel('research', null)
        const configured = researchSlot ? null : await getOpenRouterDefaultModel()
        const model =
          researchSlot ?? (isAllowedChatModel(configured) ? configured.trim() : FALLBACK_MODEL)
        const engine = await resolveEngine()

        const body = {
          model,
          max_tokens: 1500,
          messages: [
            { role: 'system', content: buildResearchSystemPrompt(currency, region.state) },
            { role: 'user', content: buildResearchSearchPrompt(items, region, currency) },
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

        attempted = true
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

        if (!res.ok) {
          report()
          return items.map((i) => missFor(i, currency))
        }

        const json = (await res.json()) as OpenRouterResearchResponse
        if (json.error?.message) {
          report()
          return items.map((i) => missFor(i, currency))
        }
        diag.httpOk = true

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
        // Best-effort usage report (web-search request count); never breaks the lookup.
        try {
          costContext?.onUsage?.({ searches: json.usage?.server_tool_use?.web_search_requests ?? null })
        } catch {
          // observability only
        }

        const message = json.choices?.[0]?.message
        const content = message?.content
        if (typeof content !== 'string') {
          report()
          return items.map((i) => missFor(i, currency))
        }

        // Index the real citations returned by the search tool: url -> snippet.
        // D4 (quick-260705-2gp): shape-tolerant — accepts BOTH the documented
        // nested `url_citation` object and the live-observed FLAT shape (url +
        // content directly on the annotation). A real citation must never be
        // dropped over its shape: every dropped citation nulls a source_url and
        // sends the result into the evidence gate's 100%-rejection mode.
        const citationByUrl = new Map<string, string>()
        // Same citations keyed by normalized URL (host without www + path), first one wins.
        const citationByNormUrl = new Map<string, string>()
        for (const a of message?.annotations ?? []) {
          // Skip ONLY when a type is present AND differs — an absent type stays
          // tolerated (matches the previous indexer's behavior).
          if (a?.type != null && a.type !== 'url_citation') continue
          const url = a?.url_citation?.url ?? a?.url
          if (typeof url === 'string' && url.trim().length > 0) {
            const snippet = a?.url_citation?.content ?? a?.content ?? ''
            citationByUrl.set(url, snippet)
            const norm = normalizeCitationUrl(url)
            if (norm && !citationByNormUrl.has(norm)) citationByNormUrl.set(norm, snippet)
          }
        }
        diag.citations = citationByUrl.size

        // Parse the model JSON — tolerant of prose-wrapped / fenced ```json replies
        // (web-search models routinely return a preamble + fenced block + a note).
        const parsedUnknown = extractJsonObject(content)
        if (parsedUnknown == null) {
          report()
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
        if (!parsed.success) {
          report()
          return items.map((i) => missFor(i, currency))
        }
        diag.parsed = true
        diag.returned = parsed.data.results.length

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
        // Evidence gate for one result, reporting whether the citation matched loosely.
        const gate = (r: (typeof parsed.data.results)[number], name: string) => {
          const claimedUrl = r.source_url
          let snippet: string | undefined
          let loose = false
          if (claimedUrl != null) {
            if (citationByUrl.has(claimedUrl)) {
              snippet = citationByUrl.get(claimedUrl)
            } else {
              const norm = normalizeCitationUrl(claimedUrl)
              if (norm && citationByNormUrl.has(norm)) {
                snippet = citationByNormUrl.get(norm)
                loose = true
              }
            }
          }
          const cited = claimedUrl != null && snippet !== undefined
          const result: PriceResearchResult = {
            name,
            unit_price: r.unit_price,
            currency: r.currency,
            source_url: cited ? claimedUrl : null,
            snippet: cited ? snippet || r.snippet : null,
            confidence: r.confidence ?? null,
            unit: r.unit ?? null,
          }
          return { result, cited, loose }
        }

        // Name re-association: exact name first; else a loose key (lowercase, punctuation
        // collapsed) that belongs to exactly one requested item AND exactly one result not
        // already matched exactly. The returned name is always the REQUESTED name.
        const results = parsed.data.results
        const byExactName = new Map<string, (typeof results)[number]>()
        for (const r of results) byExactName.set(r.name, r)
        const exactlyMatched = new Set(items.filter((i) => byExactName.has(i.name)).map((i) => byExactName.get(i.name)))
        const itemsByLoose = new Map<string, number>()
        for (const i of items) {
          const k = looseNameKey(i.name)
          itemsByLoose.set(k, (itemsByLoose.get(k) ?? 0) + 1)
        }
        const freeResultsByLoose = new Map<string, Array<(typeof results)[number]>>()
        for (const r of results) {
          if (exactlyMatched.has(r)) continue
          const k = looseNameKey(r.name)
          const list = freeResultsByLoose.get(k) ?? []
          list.push(r)
          freeResultsByLoose.set(k, list)
        }

        const out = items.map((i) => {
          let r = byExactName.get(i.name)
          let looseName = false
          if (!r) {
            const k = looseNameKey(i.name)
            const free = freeResultsByLoose.get(k)
            if (k && itemsByLoose.get(k) === 1 && free?.length === 1) {
              r = free[0]
              looseName = true
            }
          }
          if (!r) return missFor(i, currency)
          const { result, cited, loose } = gate(r, i.name)
          diag.matched++
          if (looseName) diag.matchedLoosely++
          if (cited) {
            diag.cited++
            if (loose) diag.citedLoosely++
          }
          return result
        })
        report()

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
        if (attempted) report()
        return items.map((i) => missFor(i, currency))
      }
    },
  }
}
