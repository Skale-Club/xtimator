// lib/ai/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from '../types'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildSystemPrompt, buildUserContent } from '../prompt-builder'
import { normalizeOutput } from '../normalize'

export class AnthropicAdapter implements AIProvider {
  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    const apiKey = await getIntegrationKey('anthropic')
    if (!apiKey) throw new Error('Anthropic API key not configured')

    const anthropic = new Anthropic({ apiKey })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: buildSystemPrompt(input),
      messages: [{ role: 'user', content: buildUserContent(input) }],
      tools: [
        {
          name: 'create_estimate',
          description: 'Create a structured estimate with sections and line items',
          input_schema: {
            type: 'object' as const,
            required: ['summary', 'sections', 'suggested_project_name'],
            properties: {
              suggested_project_name: {
                type: 'string',
                description: 'A short, professional project name in 2-5 words derived from the work scope and client. Examples: "Smith Bathroom Remodel", "Garcia Driveway Repaving", "Patel Kitchen Reno". Avoid generic words like "Project" or "Estimate".',
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
    return normalizeOutput(raw)
  }

  async refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput> {
    const apiKey = await getIntegrationKey('anthropic')
    if (!apiKey) throw new Error('Anthropic API key not configured')

    const anthropic = new Anthropic({ apiKey })

    const priceBookContext =
      input.priceBookItems.length > 0
        ? '## Company Price Book\n' +
          input.priceBookItems
            .map(item => `- ${item.category} | ${item.name} | $${item.unit_price.toFixed(2)}/${item.unit ?? 'each'}`)
            .join('\n')
        : 'No company price book configured.'

    const systemPrompt = `You are a professional estimator. Your task is to update an existing estimate based on a refinement instruction. Modify, add, or remove sections/items as needed to reflect the user's request. Keep everything else unchanged. Preserve the price_source tagging: use "price_book" for items from the price book, "ai_estimate" for items you estimate from market rates.`

    const userContent = `${priceBookContext}

## Current Estimate
${JSON.stringify(input.existingEstimate, null, 2)}

## Refinement Instruction
${input.instruction}

Task: Update the estimate to reflect the user's instruction. Return the full updated estimate in JSON format.`

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
            required: ['summary', 'sections', 'suggested_project_name'],
            properties: {
              suggested_project_name: {
                type: 'string',
                description: 'A short, professional project name in 2-5 words. Return the same name unless the instruction changes it.',
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
    return normalizeOutput(raw)
  }
}
