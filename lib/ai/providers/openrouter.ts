// lib/ai/providers/openrouter.ts
//
// OpenRouter adapter — single API key, hundreds of models from many vendors
// behind one OpenAI-API-compatible endpoint. We use plain fetch (no SDK) to
// avoid adding the openai npm dep just for the chat-completions call shape.
//
// Constructor takes the model id at runtime so a single adapter class can
// power both the platform-default OpenRouter selection AND per-company
// overrides (see lib/ai/index.ts).
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from '../types'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildSystemPrompt, buildUserContent, buildRefineUserContent } from '../prompt-builder'
import { normalizeOutput, appendRetryHint } from '../normalize'
import { InvalidEstimateOutputError } from '../with-fallback'
import { toRefineEstimateInput } from './refine-input'
import { langfuseClient } from '@/lib/observability/langfuse'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

const estimateToolSchema = {
  type: 'object' as const,
  required: ['summary', 'sections', 'suggested_project_name'],
  properties: {
    suggested_project_name: {
      type: 'string',
      description:
        'A short, professional project name in 2-5 words derived from the work scope and client. Examples: "Smith Bathroom Remodel", "Garcia Driveway Repaving", "Patel Kitchen Reno". Avoid generic words like "Project" or "Estimate".',
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
  }>
  error?: { message?: string }
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export class OpenRouterAdapter implements AIProvider {
  constructor(private readonly model: string) {
    if (!model) throw new Error('OpenRouter model is required')
  }

  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    const user = appendRetryHint(buildUserContent(input), input.retryHint)
    const raw = await this.callTool({
      system: buildSystemPrompt(input),
      user,
      operationName: 'generate_estimate',
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

    const raw = await this.callTool({ system, user, operationName: 'refine_estimate' })
    const r = normalizeOutput(raw)
    if (!r.ok) throw new InvalidEstimateOutputError(r.error)
    return r.value
  }

  private async callTool(args: {
    system: string
    user: string
    operationName?: string
  }): Promise<Record<string, unknown>> {
    const apiKey = await getIntegrationKey('openrouter')
    if (!apiKey) throw new Error('OpenRouter API key not configured')

    const startTime = new Date()
    const operationName = args.operationName ?? 'generate_estimate'

    const body = {
      model: this.model,
      max_tokens: 4096,
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

    const toolCall = json.choices?.[0]?.message?.tool_calls?.find(
      (t) => t.function?.name === 'create_estimate'
    )
    const argsJson = toolCall?.function?.arguments
    if (!argsJson) {
      throw new Error(
        `OpenRouter did not return a structured estimate from model ${this.model}`
      )
    }

    try {
      const parsed = JSON.parse(argsJson) as Record<string, unknown>
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
