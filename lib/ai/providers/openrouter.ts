// lib/ai/providers/openrouter.ts
//
// OpenRouter adapter — single API key, hundreds of models from many vendors
// behind one OpenAI-API-compatible endpoint. We use plain fetch (no SDK) to
// avoid adding the openai npm dep just for the chat-completions call shape.
//
// Constructor takes the model id at runtime so a single adapter class can
// power both the platform-default OpenRouter selection AND per-company
// overrides (see lib/ai/index.ts).
import { randomUUID } from 'node:crypto'
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from '../types'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildSystemPrompt, buildUserContent, buildRefineUserContent } from '../prompt-builder'
import { normalizeOutput, appendRetryHint } from '../normalize'
import { InvalidEstimateOutputError, TruncatedOutputError } from '../with-fallback'
import { toRefineEstimateInput } from './refine-input'
import { langfuseClient } from '@/lib/observability/langfuse'
import { recordAICost } from '@/lib/billing/record-ai-cost'
// AIREL-01: single source of truth for the 120s chat-completion budget — see
// openrouter-client.ts's comment for the AbortSignal.timeout rationale.
import { AI_CHAT_TIMEOUT_MS } from '../openrouter-client'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

// AIREL-03: exported so the parity test (tests/unit/ai/tool-schema-fields.test.ts)
// can statically import this object and lock its shape against drift from the
// zod schema (lib/ai/schema.ts) and the Gemini tool schema (gemini.ts).
export const estimateToolSchema = {
  type: 'object' as const,
  required: ['summary', 'sections', 'suggested_project_name', 'detected_trade'],
  properties: {
    suggested_project_name: {
      type: 'string',
      description:
        'A short, professional project name in 2-5 words derived from the work scope and client. Examples: "Smith Bathroom Remodel", "Garcia Driveway Repaving", "Patel Kitchen Reno". Avoid generic words like "Project" or "Estimate".',
    },
    detected_trade: {
      type: 'string',
      description:
        "The trade/category of the REQUESTED work itself (e.g. cleaning, electrical, plumbing, landscaping), inferred from the request content — independent of the company's configured industry.",
    },
    suggested_client_name: {
      type: 'string',
      description:
        'The customer/homeowner/business name explicitly mentioned in the transcript, description, or photo analysis. Return an empty string or omit when no clear client name is present. Do not infer from generic project titles or addresses.',
    },
    summary: { type: 'string', description: 'Brief summary of the work scope' },
    notes: { type: 'string', description: 'Additional notes or assumptions' },
    timeline: { type: 'string', description: 'Estimated timeline for completion' },
    payment_terms: { type: 'string', description: 'Payment terms' },
    warranty_terms: { type: 'string', description: 'Warranty information' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'items'],
        properties: {
          title: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['description', 'quantity', 'unit_price', 'price_source'],
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string' },
                unit_price: { type: 'number' },
                price_source: {
                  type: 'string',
                  enum: ['price_book', 'ai_estimate'],
                  description:
                    "'price_book' if this price came from the company's price book entry. 'ai_estimate' if you estimated it from market rates.",
                },
                // AIREL-03: the four pricing fields the LIVE OpenRouter schema
                // was missing — gemini.ts:144-154 and the zod schema.ts:31-43
                // both already carry them (only the Gemini fallback / refine
                // path could ask for per-category tax + cost/markup). All
                // OPTIONAL (see required[] below — deliberately NOT added
                // there) and classification-only: the AI labels/suggests, the
                // server always computes the trusted numbers (ENG-01 — no AI
                // calculator).
                taxable: {
                  type: 'boolean',
                  description: 'true if this line item is taxable (default true if omitted).',
                },
                tax_category: {
                  type: 'string',
                  enum: ['labor', 'materials', 'other'],
                  description:
                    'Classify the work: "labor" for labor/service lines, "materials" for physical goods, "other" otherwise. Classification only — do NOT compute any tax.',
                },
                cost: {
                  type: 'number',
                  description:
                    'Optional per-unit COST (your cost basis). Provide cost + markup_pct INSTEAD of unit_price and the server computes the price. Do NOT compute the marked-up price yourself.',
                },
                markup_pct: {
                  type: 'number',
                  description:
                    'Optional markup percent applied to cost (e.g. 20 = 20%). The server computes unit_price = cost × (1 + markup_pct/100).',
                },
              },
            },
          },
        },
      },
    },
  },
}

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string }
      }>
    }
    // AIREL-02: 'length' means the model's response was cut off by max_tokens
    // — read so a truncated generation is typed (TruncatedOutputError) instead
    // of masquerading as a generic parse failure.
    finish_reason?: string
  }>
  error?: { message?: string }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    // Phase 110 (COST-01): real USD cost, returned automatically on every
    // response (OpenRouter credits are 1:1 USD). No request flag needed.
    cost?: number
    cost_details?: { upstream_inference_cost?: number | null }
  }
}

export class OpenRouterAdapter implements AIProvider {
  /**
   * @param apiKeyOverride Billing v2 BYOK: the company's OWN OpenRouter key
   *   (decrypted upstream in getAIProvider). When present it replaces the
   *   platform key for every call this adapter makes — the company pays its own
   *   AI bill, and the credit ledger skips debits for it. NEVER logged.
   */
  constructor(
    private readonly model: string,
    private readonly apiKeyOverride?: string
  ) {
    if (!model) throw new Error('OpenRouter model is required')
  }

  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    const user = appendRetryHint(buildUserContent(input), input.retryHint)
    const raw = await this.callTool({
      system: buildSystemPrompt(input),
      user,
      operationName: 'generate_estimate',
      costContext: input.costContext,
    })
    const r = normalizeOutput(raw)
    if (!r.ok) throw new InvalidEstimateOutputError(r.error)
    return r.value
  }

  async refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput> {
    // HARD-02/UNIFY-02: refine reuses the SHARED prompt builder — no bespoke
    // prompt. Gains the language, price-book, Additional-Instructions, Security,
    // and sanitizeField blocks for free; the instruction is escaped + tagged.
    const refineInput = toRefineEstimateInput(input)
    const system = buildSystemPrompt(refineInput, { mode: 'refine' })
    const user = appendRetryHint(
      buildRefineUserContent(refineInput, input.existingEstimate, input.instruction),
      input.retryHint
    )

    // RefineEstimateInput carries no costContext (generate is the COST-01 primary
    // path); the cost is still captured, correlated with null ids via randomUUID.
    const raw = await this.callTool({ system, user, operationName: 'refine_estimate' })
    const r = normalizeOutput(raw)
    if (!r.ok) throw new InvalidEstimateOutputError(r.error)
    return r.value
  }

  private async callTool(args: {
    system: string
    user: string
    operationName?: string
    // Phase 110 (COST-01): non-LLM correlation context for cost capture. Absent
    // on the refine path (and pre-110 callers) → cost still recorded with null ids.
    costContext?: {
      attemptId?: string | null
      companyId?: string | null
      projectId?: string | null
    }
  }): Promise<Record<string, unknown>> {
    // BYOK: the per-company key override wins; otherwise the platform key.
    const apiKey = this.apiKeyOverride ?? (await getIntegrationKey('openrouter'))
    if (!apiKey) throw new Error('OpenRouter API key not configured')

    const startTime = new Date()
    const operationName = args.operationName ?? 'generate_estimate'

    const body = {
      model: this.model,
      // AIREL-02: 4096 was tight — a rich 40-50-item estimate needs roughly
      // 2,900-4,400 output tokens, leaving little headroom before a silent
      // truncation. Raised to 8192, symmetric with Gemini's maxOutputTokens.
      max_tokens: 8192,
      // AIREL-05: pinned for BOTH generate and refine (this one body covers
      // both operations) to minimize run-to-run price/output variance — no
      // temperature was set anywhere on the estimate paths before this.
      temperature: 0.3,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.user },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'create_estimate',
            description: 'Create a structured estimate with sections and line items',
            parameters: estimateToolSchema,
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'create_estimate' },
      },
      // COST-01: ask OpenRouter to include the real upstream USD cost in the
      // response `usage` block. Without this, `usage.cost` is often absent and
      // credit debiting has nothing to charge against.
      usage: { include: true },
    }

    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter recommends these for attribution/analytics — they don't
        // affect routing but show in the admin dashboard. Safe to omit.
        'HTTP-Referer': 'https://xtimator.com',
        'X-Title': 'Xtimator',
      },
      body: JSON.stringify(body),
      // AIREL-01: the ONLY unbounded fetch on the primary generation path — a
      // hung socket previously never threw, so the Gemini fallback was
      // unreachable and the Inngest step stayed pinned indefinitely.
      signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(
        `OpenRouter request failed (${res.status}): ${errText.slice(0, 500)}`
      )
    }

    const json = (await res.json()) as OpenRouterChatResponse
    if (json.error?.message) {
      throw new Error(`OpenRouter error: ${json.error.message}`)
    }

    const choice = json.choices?.[0]
    const toolCall = choice?.message?.tool_calls?.find(
      (t) => t.function?.name === 'create_estimate'
    )
    const argsJson = toolCall?.function?.arguments

    // AIREL-02: check finish_reason BEFORE the !argsJson guard below. A
    // truncation early enough that no tool-call arguments exist at all is
    // STILL typed as truncation (not the generic "did not return a
    // structured estimate" error) — and a truncation that lands on
    // byte-for-byte VALID JSON is ALSO typed as truncation here, so a silent
    // partial estimate can never parse through as if it were complete.
    // (Known/accepted: the truncated primary call's usage.cost is not
    // recorded here — consistent with the pre-existing malformed-JSON path;
    // noted for Phase 167, no action in this plan.)
    if (choice?.finish_reason === 'length') {
      throw new TruncatedOutputError(operationName)
    }

    if (!argsJson) {
      throw new Error(
        `OpenRouter did not return a structured estimate from model ${this.model}`
      )
    }

    try {
      const parsed = JSON.parse(argsJson) as Record<string, unknown>
      // Phase 110 (COST-01): capture the real USD cost alongside the existing
      // Langfuse token block. `usage.cost` is returned when we request
      // `usage: { include: true }` — null when absent, NEVER coerced to 0.
      // Correlation ids come ONLY from the trusted, non-LLM costContext (never
      // from `parsed`/json.choices).
      //
      // AWAIT (not `void`): this runs inside an Inngest step. When the step
      // resolves/suspends, the serverless invocation can be frozen and any
      // floating promise dropped before its fetch/INSERT lands — which left
      // ai_cost_events empty and broke credit debiting entirely. recordAICost
      // is never-throw (internal try/catch), so awaiting it is safe and can
      // never affect the estimate return.
      const realCostUsd = json.usage?.cost ?? null
      await recordAICost({
        attemptId: args.costContext?.attemptId ?? randomUUID(),
        operationType: 'estimate',
        provider: 'openrouter',
        model: this.model,
        realCostUsd,
        companyId: args.costContext?.companyId ?? null,
        projectId: args.costContext?.projectId ?? null,
      })
      try {
        const gen = langfuseClient.generation({
          name: operationName,
          model: this.model,
          input: body.messages,
          startTime,
          usage: {
            input: json.usage?.prompt_tokens,
            output: json.usage?.completion_tokens,
          },
        })
        gen.end({ output: parsed, endTime: new Date() })
        await langfuseClient.flushAsync()
      } catch (err) {
        console.warn('[langfuse] generation trace failed:', err)
      }
      return parsed
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error('OpenRouter returned malformed tool-call arguments')
      }
      throw err
    }
  }
}
