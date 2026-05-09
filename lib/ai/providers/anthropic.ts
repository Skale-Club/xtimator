// lib/ai/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput } from '../types'
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
}
