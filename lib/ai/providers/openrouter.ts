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
import { buildSystemPrompt, buildUserContent } from '../prompt-builder'
import { normalizeOutput } from '../normalize'

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
}

export class OpenRouterAdapter implements AIProvider {
  constructor(private readonly model: string) {
    if (!model) throw new Error('OpenRouter model is required')
  }

  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    const raw = await this.callTool({
      system: buildSystemPrompt(input),
      user: buildUserContent(input),
    })
    return normalizeOutput(raw)
  }

  async refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput> {
    const priceBookContext =
      input.priceBookItems.length > 0
        ? '## Company Price Book\n' +
          input.priceBookItems
            .map(
              (item) =>
                `- ${item.folder_name ?? 'Uncategorized'} | ${item.name} | $${item.unit_price.toFixed(
                  2
                )}/${item.unit ?? 'each'}`
            )
            .join('\n')
        : 'No company price book configured.'

    const system =
      'You are a professional estimator. Your task is to update an existing estimate based on a refinement instruction. Modify, add, or remove sections/items as needed to reflect the user\'s request. Keep everything else unchanged. Preserve the price_source tagging: use "price_book" for items from the price book, "ai_estimate" for items you estimate from market rates.'

    const user = `${priceBookContext}

## Current Estimate
${JSON.stringify(input.existingEstimate, null, 2)}

## Refinement Instruction
${input.instruction}

Task: Update the estimate to reflect the user's instruction. Return the full updated estimate in JSON format.`

    const raw = await this.callTool({ system, user })
    return normalizeOutput(raw)
  }

  private async callTool(args: {
    system: string
    user: string
  }): Promise<Record<string, unknown>> {
    const apiKey = await getIntegrationKey('openrouter')
    if (!apiKey) throw new Error('OpenRouter API key not configured')

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
      return JSON.parse(argsJson) as Record<string, unknown>
    } catch {
      throw new Error('OpenRouter returned malformed tool-call arguments')
    }
  }
}
