import 'server-only'
/**
 * Anthropic-web price-research adapter — GATED quality-fallback (Phase 107 Plan 02 — RSRC-02).
 *
 * Anthropic is the FALLBACK vendor — do NOT invert the hierarchy. The default
 * remains the OpenRouter-web adapter; this source is reachable only when
 * getActiveResearchSource() (provider.ts) returns 'anthropic_web'.
 *
 * Uses the @anthropic-ai/sdk `web_search` tool (already a project dependency, no new
 * credential) with `user_location { type:'approximate', city, region:state,
 * country:'US' }` — the strongest regional grounding for "average price in {city},
 * {state}". The query is built through buildResearchSearchPrompt (the hardened
 * <search_result>/sanitizeField boundary), never ad-hoc concat.
 *
 * Evidence gate (Pitfall 1): a result is only trusted when the response carries a
 * real citation (a web_search_result_location url + cited_text). A
 * web_search_tool_result_error, or a result lacking a real citation, is nulled out so
 * isUsableCandidate (provider.ts) rejects it downstream. Never throws — any failure
 * (including a missing key) degrades every requested item to a miss.
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import Anthropic from '@anthropic-ai/sdk'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildResearchSearchPrompt } from '../search-prompt'
import { priceResearchPayloadSchema } from '../schema'
import type { PriceResearchProvider, PriceResearchResult, Region } from '../provider'

// Model id per CLAUDE.md (Anthropic estimate/photo path).
const MODEL = 'claude-sonnet-4-20250514'
const MAX_SEARCH_USES = 5

type AnthropicContentBlock = {
  type?: string
  text?: string
  content?:
    | Array<{ type?: string; url?: string; title?: string }>
    | { type?: string; error_code?: string }
  citations?: Array<{
    type?: string
    url?: string
    title?: string
    cited_text?: string
  }>
}

type AnthropicResponse = { content?: AnthropicContentBlock[] }

export function makeAnthropicWebProvider(): PriceResearchProvider {
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

      const apiKey = await getIntegrationKey('anthropic')
      if (!apiKey) return items.map((i) => missFor(i, currency))

      try {
        const client = new Anthropic({ apiKey })

        const response = (await client.messages.create({
          model: MODEL,
          max_tokens: 1500,
          messages: [
            { role: 'user', content: buildResearchSearchPrompt(items, region) },
          ],
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: MAX_SEARCH_USES,
              user_location: {
                type: 'approximate',
                city: region.city ?? undefined,
                region: region.state ?? undefined,
                country: 'US',
              },
            },
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)) as unknown as AnthropicResponse

        const blocks = response.content ?? []

        // If the search tool itself errored, every item is a miss.
        const searchErrored = blocks.some(
          (b) =>
            b.type === 'web_search_tool_result' &&
            !Array.isArray(b.content) &&
            b.content?.type === 'web_search_tool_result_error'
        )
        if (searchErrored) return items.map((i) => missFor(i, currency))

        // Index the real citations: url -> cited_text snippet.
        const citationByUrl = new Map<string, string>()
        for (const b of blocks) {
          for (const c of b.citations ?? []) {
            if (typeof c.url === 'string' && c.url.trim().length > 0) {
              citationByUrl.set(c.url, c.cited_text ?? '')
            }
          }
        }

        // Concatenate the model's text blocks and parse the JSON payload.
        const text = blocks
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string)
          .join('\n')

        let parsedUnknown: unknown
        try {
          const stripped = text
            .replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1') // first {...} block
            .trim()
          parsedUnknown = JSON.parse(stripped)
        } catch {
          return items.map((i) => missFor(i, currency))
        }

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

        // Re-associate one result per item, enforcing the evidence gate: a
        // self-asserted source_url is only trusted when it matches a real citation.
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

        return items.map((i) => byName.get(i.name) ?? missFor(i, currency))
      } catch {
        // Never throw — research failures degrade to misses (non-fatal contract).
        return items.map((i) => missFor(i, currency))
      }
    },
  }
}
