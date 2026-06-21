// lib/ai/providers/gemini.ts
import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai'
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from '../types'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildSystemPrompt, buildUserContent } from '../prompt-builder'
import { normalizeOutput } from '../normalize'
import { formatMoney, normalizeCurrencyCode } from '@/lib/money/currency'

/** File-extension → MIME type for inline audio sent to Gemini. */
const AUDIO_EXT_TO_MIME: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mp3',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
}

const TRANSCRIBE_PROMPT =
  'Transcribe this audio recording to plain text. Return ONLY the spoken words as a ' +
  'continuous transcript — no commentary, speaker labels, timestamps, or markdown. ' +
  'If there is no discernible speech, return an empty string.'

/**
 * Transcribe audio to plain text using Gemini's multimodal model.
 *
 * This is the keyless-OpenAI fallback for transcription: when no OpenAI Whisper
 * key is configured, `transcribeAudioOR` delegates here so the platform's
 * existing Gemini key still produces transcripts. Gemini 2.5 Flash accepts
 * inline audio and returns the spoken text directly.
 */
export async function transcribeAudioGemini(audioBlob: Blob, ext: string): Promise<string> {
  const apiKey = await getIntegrationKey('gemini')
  if (!apiKey) throw new Error('Gemini API key not configured')

  const ai = new GoogleGenAI({ apiKey })
  const buf = Buffer.from(await audioBlob.arrayBuffer())
  const base64 = buf.toString('base64')
  const mimeType = AUDIO_EXT_TO_MIME[ext.toLowerCase()] ?? 'audio/webm'

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { text: TRANSCRIBE_PROMPT },
      { inlineData: { mimeType, data: base64 } },
    ],
  })

  return (response.text ?? '').trim()
}

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
    const currencyCode = normalizeCurrencyCode(input.currencyCode)
    const apiKey = await getIntegrationKey('gemini')
    if (!apiKey) throw new Error('Gemini API key not configured')

    const ai = new GoogleGenAI({ apiKey })

    const priceBookContext =
      input.priceBookItems.length > 0
        ? '## Company Price Book\n' +
          input.priceBookItems
            .map(item => `- ${item.folder_name ?? 'Uncategorized'} | ${item.name} | ${formatMoney(item.unit_price, item.currency_code ?? currencyCode)}/${item.unit ?? 'each'}`)
            .join('\n')
        : 'No company price book configured.'

    const systemInstruction = `You are a professional estimator. Your task is to update an existing estimate based on a refinement instruction. Modify, add, or remove sections/items as needed to reflect the user's request. Keep everything else unchanged. Use ${currencyCode} for all numeric prices and return monetary values as plain numbers only, without currency symbols or formatted strings. Preserve the price_source tagging: use "price_book" for items from the price book, "ai_estimate" for items you estimate from market rates.`

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
