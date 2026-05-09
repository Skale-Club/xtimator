// lib/ai/providers/gemini.ts
import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai'
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from '../types'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildSystemPrompt, buildUserContent } from '../prompt-builder'
import { normalizeOutput } from '../normalize'

export class GeminiAdapter implements AIProvider {
  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    const apiKey = await getIntegrationKey('gemini')
    if (!apiKey) throw new Error('Gemini API key not configured')

    const ai = new GoogleGenAI({ apiKey })

    const createEstimateDeclaration = {
      name: 'create_estimate',
      description: 'Create a structured estimate with sections and line items',
      parameters: {
        type: Type.OBJECT,
        required: ['summary', 'sections', 'suggested_project_name'],
        properties: {
          suggested_project_name: { type: Type.STRING, description: 'Short professional project name 2-5 words.' },
          suggested_client_name: {
            type: Type.STRING,
            description: 'The customer/homeowner/business name explicitly mentioned in the transcript, description, or photo analysis. Return an empty string or omit when no clear client name is present. Do not infer from generic project titles or addresses.',
          },
          summary: { type: Type.STRING, description: 'Brief summary of work scope' },
          notes: { type: Type.STRING },
          timeline: { type: Type.STRING },
          payment_terms: { type: Type.STRING },
          warranty_terms: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['title', 'items'],
              properties: {
                title: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ['description', 'quantity', 'unit_price', 'price_source'],
                    properties: {
                      description: { type: Type.STRING },
                      quantity: { type: Type.NUMBER },
                      unit: { type: Type.STRING },
                      unit_price: { type: Type.NUMBER },
                      price_source: {
                        type: Type.STRING,
                        // Note: Gemini has no Type.ENUM — use STRING + description (D-15 fallback handles enforcement)
                        description: "Must be 'price_book' if price came from company price book, or 'ai_estimate' if estimated from market rates.",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: buildUserContent(input),
      config: {
        systemInstruction: buildSystemPrompt(input),
        tools: [{ functionDeclarations: [createEstimateDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['create_estimate'],
          },
        },
      },
    })

    const fc = response.functionCalls?.[0]
    if (!fc) throw new Error('Gemini did not return a function call')
    const args = fc.args as Record<string, unknown>
    return normalizeOutput(args)
  }

  async refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput> {
    const apiKey = await getIntegrationKey('gemini')
    if (!apiKey) throw new Error('Gemini API key not configured')

    const ai = new GoogleGenAI({ apiKey })

    const priceBookContext =
      input.priceBookItems.length > 0
        ? '## Company Price Book\n' +
          input.priceBookItems
            .map(item => `- ${item.category} | ${item.name} | $${item.unit_price.toFixed(2)}/${item.unit ?? 'each'}`)
            .join('\n')
        : 'No company price book configured.'

    const systemInstruction = `You are a professional estimator. Your task is to update an existing estimate based on a refinement instruction. Modify, add, or remove sections/items as needed to reflect the user's request. Keep everything else unchanged. Preserve the price_source tagging: use "price_book" for items from the price book, "ai_estimate" for items you estimate from market rates.`

    const userContent = `${priceBookContext}

## Current Estimate
${JSON.stringify(input.existingEstimate, null, 2)}

## Refinement Instruction
${input.instruction}

Task: Update the estimate to reflect the user's instruction. Return the full updated estimate in JSON format.`

    const createEstimateDeclaration = {
      name: 'create_estimate',
      description: 'Create a structured estimate with sections and line items',
      parameters: {
        type: Type.OBJECT,
        required: ['summary', 'sections', 'suggested_project_name'],
        properties: {
          suggested_project_name: { type: Type.STRING, description: 'Short professional project name. Return the same name unless the instruction changes it.' },
          suggested_client_name: { type: Type.STRING, description: 'The customer name. Return the same value unless the instruction changes it.' },
          summary: { type: Type.STRING, description: 'Brief summary of work scope' },
          notes: { type: Type.STRING },
          timeline: { type: Type.STRING },
          payment_terms: { type: Type.STRING },
          warranty_terms: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['title', 'items'],
              properties: {
                title: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ['description', 'quantity', 'unit_price', 'price_source'],
                    properties: {
                      description: { type: Type.STRING },
                      quantity: { type: Type.NUMBER },
                      unit: { type: Type.STRING },
                      unit_price: { type: Type.NUMBER },
                      price_source: {
                        type: Type.STRING,
                        description: "Must be 'price_book' if price came from company price book, or 'ai_estimate' if estimated from market rates.",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userContent,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [createEstimateDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['create_estimate'],
          },
        },
      },
    })

    const fc = response.functionCalls?.[0]
    if (!fc) throw new Error('Gemini did not return a function call')
    const args = fc.args as Record<string, unknown>
    return normalizeOutput(args)
  }
}
