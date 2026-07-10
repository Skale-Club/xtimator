// lib/ai/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from '../types'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildSystemPrompt, buildUserContent, buildRefineUserContent } from '../prompt-builder'
import { normalizeOutput, appendRetryHint } from '../normalize'
import { InvalidEstimateOutputError } from '../with-fallback'
import { toRefineEstimateInput } from './refine-input'

export class AnthropicAdapter implements AIProvider {
  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    const apiKey = await getIntegrationKey('anthropic')
    if (!apiKey) throw new Error('Anthropic API key not configured')

    // Bound each request: without an explicit timeout the SDK would wait on a
    // hung upstream connection indefinitely, holding the route/Inngest step open.
    // maxRetries lets the SDK transparently retry transient failures (incl. an
    // aborted request) before the error surfaces to with-fallback's error path.
    const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: buildSystemPrompt(input),
      messages: [{ role: 'user', content: appendRetryHint(buildUserContent(input), input.retryHint) }],
      tools: [
        {
          name: 'create_estimate',
          description: 'Create a structured estimate with sections and line items',
          input_schema: {
            type: 'object' as const,
            required: ['summary', 'sections', 'suggested_project_name', 'detected_trade'],
            properties: {
              suggested_project_name: {
                type: 'string',
                description: 'A short, professional project name in 2-5 words derived from the work scope and client. Examples: "Smith Bathroom Remodel", "Garcia Driveway Repaving", "Patel Kitchen Reno". Avoid generic words like "Project" or "Estimate".',
              },
              detected_trade: {
                type: 'string',
                description: "The trade/category of the REQUESTED work itself (e.g. cleaning, electrical, plumbing, landscaping), inferred from the request content — independent of the company's configured industry.",
              },
              suggested_client_name: {
                type: 'string',
                description: 'The customer/homeowner/business name explicitly mentioned in the transcript, description, or photo analysis. Return an empty string or omit when no clear client name is present. Do not infer from generic project titles or addresses.',
              },
              summary: {
                type: 'string',
                description: 'Brief summary of the work scope',
              },
              notes: {
                type: 'string',
                description: 'Additional notes or assumptions',
              },
              timeline: {
                type: 'string',
                description: 'Estimated timeline for completion',
              },
              payment_terms: {
                type: 'string',
                description: 'Payment terms',
              },
              warranty_terms: {
                type: 'string',
                description: 'Warranty information',
              },
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
                            description: "'price_book' if this price came from the company's price book entry. 'ai_estimate' if you estimated it from market rates.",
                          },
                          taxable: {
                            type: 'boolean',
                            description: 'true if this line item is taxable (default true if omitted).',
                          },
                          tax_category: {
                            type: 'string',
                            enum: ['labor', 'materials', 'other'],
                            description: 'Classify the work: "labor" for labor/service lines, "materials" for physical goods, "other" otherwise. Classification only — do NOT compute any tax.',
                          },
                          cost: { type: 'number', description: 'Optional per-unit COST (your cost basis). Provide cost + markup_pct INSTEAD of unit_price and the server computes the price. Do NOT compute the marked-up price yourself.' },
                          markup_pct: { type: 'number', description: 'Optional markup percent applied to cost (e.g. 20 = 20%). The server computes unit_price = cost × (1 + markup_pct/100).' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'create_estimate' },
    })

    const toolBlock = response.content.find((b: { type: string }) => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Claude did not return a structured estimate')
    }
    const raw = (toolBlock as { type: 'tool_use'; input: Record<string, unknown> }).input
    const r = normalizeOutput(raw)
    if (!r.ok) throw new InvalidEstimateOutputError(r.error)
    return r.value
  }

  async refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput> {
    const apiKey = await getIntegrationKey('anthropic')
    if (!apiKey) throw new Error('Anthropic API key not configured')

    // Bound each request: without an explicit timeout the SDK would wait on a
    // hung upstream connection indefinitely, holding the route/Inngest step open.
    // maxRetries lets the SDK transparently retry transient failures (incl. an
    // aborted request) before the error surfaces to with-fallback's error path.
    const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 })

    // HARD-02/UNIFY-02: refine reuses the SHARED prompt builder — all live
    // adapters share one prompt source (no bespoke refine prompt anywhere). The
    // instruction is escaped + tagged via buildRefineUserContent.
    const refineInput = toRefineEstimateInput(input)
    const systemPrompt = buildSystemPrompt(refineInput, { mode: 'refine' })
    const userContent = appendRetryHint(
      buildRefineUserContent(refineInput, input.existingEstimate, input.instruction),
      input.retryHint
    )

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: [
        {
          name: 'create_estimate',
          description: 'Create a structured estimate with sections and line items',
          input_schema: {
            type: 'object' as const,
            required: ['summary', 'sections', 'suggested_project_name', 'detected_trade'],
            properties: {
              suggested_project_name: {
                type: 'string',
                description: 'A short, professional project name in 2-5 words. Return the same name unless the instruction changes it.',
              },
              detected_trade: {
                type: 'string',
                description: 'The trade/category of the work. Return the same value unless the instruction changes the trade of the requested work.',
              },
              suggested_client_name: {
                type: 'string',
                description: 'The customer name. Return the same value unless the instruction changes it.',
              },
              summary: {
                type: 'string',
                description: 'Brief summary of the work scope',
              },
              notes: {
                type: 'string',
                description: 'Additional notes or assumptions',
              },
              timeline: {
                type: 'string',
                description: 'Estimated timeline for completion',
              },
              payment_terms: {
                type: 'string',
                description: 'Payment terms',
              },
              warranty_terms: {
                type: 'string',
                description: 'Warranty information',
              },
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
                            description: "'price_book' if this price came from the company's price book entry. 'ai_estimate' if you estimated it from market rates.",
                          },
                          taxable: {
                            type: 'boolean',
                            description: 'true if this line item is taxable (default true if omitted).',
                          },
                          tax_category: {
                            type: 'string',
                            enum: ['labor', 'materials', 'other'],
                            description: 'Classify the work: "labor" for labor/service lines, "materials" for physical goods, "other" otherwise. Classification only — do NOT compute any tax.',
                          },
                          cost: { type: 'number', description: 'Optional per-unit COST (your cost basis). Provide cost + markup_pct INSTEAD of unit_price and the server computes the price. Do NOT compute the marked-up price yourself.' },
                          markup_pct: { type: 'number', description: 'Optional markup percent applied to cost (e.g. 20 = 20%). The server computes unit_price = cost × (1 + markup_pct/100).' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'create_estimate' },
    })

    const toolBlock = response.content.find((b: { type: string }) => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Claude did not return a structured estimate')
    }
    const raw = (toolBlock as { type: 'tool_use'; input: Record<string, unknown> }).input
    const r = normalizeOutput(raw)
    if (!r.ok) throw new InvalidEstimateOutputError(r.error)
    return r.value
  }
}
