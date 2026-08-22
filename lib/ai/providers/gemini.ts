// lib/ai/providers/gemini.ts
import { randomUUID } from 'node:crypto'
import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai'
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from '../types'
import { getIntegrationKey } from '@/lib/platform-config'
import { buildSystemPrompt, buildUserContent, buildRefineUserContent } from '../prompt-builder'
import { normalizeOutput, appendRetryHint } from '../normalize'
import { InvalidEstimateOutputError } from '../with-fallback'
import { toRefineEstimateInput } from './refine-input'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import { computeGeminiCostUsd } from '@/lib/ai/pricing/gemini'
import {
  PHOTO_PROMPT,
  PHOTO_EXTRACTION_PROMPT,
  STRUCTURED_VISION_TIMEOUT_MS,
  STRUCTURED_VISION_MAX_TOKENS,
  validatePhotoExtraction,
  type CostContext,
} from '@/lib/ai/openrouter-client'
import type { PhotoExtraction } from '@/lib/ai/photo-extraction-schema'

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
  // NOTE: vision/transcription cost recording deferred — no costContext param;
  // would be an uncorrelated null-id row (threading costContext through here + all
  // call sites is out of scope for this focused observability fix).
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

/**
 * Analyse a single photo using Gemini's multimodal vision model.
 *
 * This is the OpenRouter-vision fallback (HARD-03): when `analyzePhotoOR`'s
 * OpenRouter call fails, the shared fallback wrapper delegates here. Mirrors
 * `transcribeAudioGemini`'s proven inlineData shape with an image MIME type.
 * `base64` is the raw base64 string; `mimeType` is e.g. "image/jpeg".
 */
export async function analyzePhotoGemini(base64: string, mimeType: string): Promise<string> {
  // NOTE: vision/transcription cost recording deferred — no costContext param;
  // would be an uncorrelated null-id row (threading costContext through here + all
  // call sites is out of scope for this focused observability fix).
  const apiKey = await getIntegrationKey('gemini')
  if (!apiKey) throw new Error('Gemini API key not configured')

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { text: PHOTO_PROMPT },
      { inlineData: { mimeType, data: base64 } },
    ],
    // Phase 168 (PHOTO-04, audit E4): the Gemini vision fallback previously had
    // NO cap (asymmetric with OpenRouter's). 450 mirrors analyzePhotoOR's base
    // cap (openrouter-client.ts) — deliberately DIFFERENT from this file's own
    // generateEstimate/refineEstimate's 8192 (a vision description is much
    // shorter than a full estimate). Flat config key per @google/genai's
    // GenerateContentConfig shape (see generateEstimate's comment above).
    config: {
      maxOutputTokens: 450,
    },
  })

  return (response.text ?? '').trim()
}

/**
 * PEXT-04 (Phase 171): Gemini functionDeclaration mirror of
 * `photoExtractionToolSchema()` (lib/ai/photo-extraction-schema.ts). EXPORTED
 * so the parity test can assert its property KEYS and the three enum
 * VALUE-SETS (embedded in `description` — Gemini has no `Type.ENUM`, see the
 * `price_source` precedent in `GeminiAdapter.generateEstimate` below) match
 * the zod-derived tool schema. The two shapes CANNOT deep-equal (different
 * SDK type systems), so key+enum parity is the drift lock — mirrors AIREL-03's
 * approach for the estimate schemas (tests/unit/ai/tool-schema-fields.test.ts).
 */
export const extractPhotoDeclaration = {
  name: 'extract_photo',
  description: 'Extract structured surfaces/measurements/materials/damage from a job-site photo.',
  parameters: {
    type: Type.OBJECT,
    required: ['overall_description'],
    properties: {
      version: { type: Type.NUMBER, description: 'Schema version. Always 1.' },
      surfaces: {
        type: Type.ARRAY,
        description: 'Distinct surfaces visible in the photo (e.g. wall, floor, ceiling, roof).',
        items: {
          type: Type.OBJECT,
          required: ['name'],
          properties: {
            name: { type: Type.STRING, description: 'e.g. "kitchen floor", "north wall"' },
            material: { type: Type.STRING, description: 'e.g. "vinyl plank", "drywall"' },
            condition: { type: Type.STRING, description: 'e.g. "worn", "new", "water damaged"' },
          },
        },
      },
      measurements: {
        type: Type.ARRAY,
        description: 'Quantities directly observed or reasonably estimated from the photo.',
        items: {
          type: Type.OBJECT,
          required: ['dimension', 'value', 'unit', 'subject'],
          properties: {
            dimension: {
              type: Type.STRING,
              // Gemini has no Type.ENUM (D-15 fallback / price_source precedent
              // above) — the parity test extracts this value set FROM the
              // description text, so keep the quoted values exact.
              description:
                "What kind of quantity this measurement represents — one of 'length', 'area', 'height', 'count'.",
            },
            value: { type: Type.NUMBER, description: 'The numeric quantity.' },
            unit: { type: Type.STRING, description: 'e.g. "sq ft", "linear ft", "ft", "each"' },
            subject: {
              type: Type.STRING,
              description: 'What was measured, e.g. "living room floor"',
            },
            confidence: {
              type: Type.STRING,
              description:
                "One of 'stated', 'estimated' — 'stated' if a measurement was explicitly given (sign, tape measure, spoken), 'estimated' if visually inferred.",
            },
          },
        },
      },
      materials: {
        type: Type.ARRAY,
        description: 'Distinct materials identified across the photo (flat string list).',
        items: { type: Type.STRING },
      },
      damage: {
        type: Type.ARRAY,
        description: 'Visible damage or defects.',
        items: {
          type: Type.OBJECT,
          required: ['description'],
          properties: {
            description: { type: Type.STRING, description: 'What the damage is and where.' },
            severity: {
              type: Type.STRING,
              description: "One of 'minor', 'moderate', 'severe' — how severe the damage appears.",
            },
          },
        },
      },
      trade_signals: {
        type: Type.ARRAY,
        description:
          'Trade/category hints this photo implies (e.g. "flooring", "roofing", "electrical").',
        items: { type: Type.STRING },
      },
      access_notes: {
        type: Type.STRING,
        description: 'Access/site constraints visible in the photo (e.g. narrow stairwell).',
      },
      overall_description: {
        type: Type.STRING,
        description:
          'A prose summary of the photo — REQUIRED. Populates the existing photo description shown to the estimator.',
      },
    },
  },
}

/**
 * PEXT-01/03/04/05 (Phase 171) — Gemini structured-extraction fallback for
 * `analyzePhotoStructuredOR` (openrouter-client.ts). Mirrors
 * `GeminiAdapter.generateEstimate`'s functionDeclarations pattern: FLAT config
 * (166-01's @google/genai lesson — no nested generation-params sub-object),
 * forced tool_choice via `FunctionCallingConfigMode.ANY` +
 * `allowedFunctionNames`, `maxOutputTokens` 700, `temperature` 0.3, and a
 * dedicated 40s `abortSignal` (`STRUCTURED_VISION_TIMEOUT_MS` — NOT this
 * file's unbounded estimate calls). Threads `costContext` (PEXT-05) — unlike
 * the plain `analyzePhotoGemini` above, which deliberately omits it; this
 * structured sibling mirrors `GeminiAdapter`'s cost-capture instead.
 */
export async function analyzePhotoStructuredGemini(
  base64: string,
  mimeType: string,
  costContext?: CostContext
): Promise<PhotoExtraction> {
  const apiKey = await getIntegrationKey('gemini')
  if (!apiKey) throw new Error('Gemini API key not configured')

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { text: PHOTO_EXTRACTION_PROMPT },
      { inlineData: { mimeType, data: base64 } },
    ],
    config: {
      tools: [{ functionDeclarations: [extractPhotoDeclaration] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ['extract_photo'],
        },
      },
      maxOutputTokens: STRUCTURED_VISION_MAX_TOKENS,
      temperature: 0.3,
      abortSignal: AbortSignal.timeout(STRUCTURED_VISION_TIMEOUT_MS),
    },
  })

  const fc = response.functionCalls?.[0]
  // COST ORDERING mirror (PEXT-05): record BEFORE validating, same rationale
  // as the OpenRouter structured path above — a genuine tool-call attempt (fc
  // present) still cost real money even if its args later fail the zod gate.
  // Gemini's SDK returns no per-call USD figure — we price it ourselves from
  // response.usageMetadata's token counts via computeGeminiCostUsd (quick-
  // 260821). That returns null (never coerced to 0) when usageMetadata is
  // absent/malformed or the model is unpriced, but the row still COUNTS the
  // attempt either way. A response with no function call at all (fc absent)
  // is not recorded, mirroring the OpenRouter sibling's `argsJson !==
  // undefined` gate.
  if (fc) {
    await recordAICost({
      attemptId: costContext?.attemptId ?? randomUUID(),
      operationType: 'vision',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      realCostUsd: computeGeminiCostUsd('gemini-2.5-flash', response.usageMetadata),
      companyId: costContext?.companyId ?? null,
      projectId: costContext?.projectId ?? null,
    })
  }
  if (!fc) {
    throw new Error('Gemini did not return a structured extraction function call')
  }
  const args = fc.args as Record<string, unknown>
  return validatePhotoExtraction(args)
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
        required: ['summary', 'sections', 'suggested_project_name', 'detected_trade'],
        properties: {
          suggested_project_name: { type: Type.STRING, description: 'Short professional project name 2-5 words.' },
          detected_trade: {
            type: Type.STRING,
            description:
              "The trade/category of the REQUESTED work itself (e.g. cleaning, electrical, plumbing, landscaping), inferred from the request content — independent of the company's configured industry.",
          },
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
                      taxable: {
                        type: Type.BOOLEAN,
                        description: 'true if this line item is taxable (default true if omitted).',
                      },
                      tax_category: {
                        type: Type.STRING,
                        // Gemini has no Type.ENUM — use STRING + description (zod schema enforces labor|materials|other)
                        description: 'Classify the work: "labor" for labor/service lines, "materials" for physical goods, "other" otherwise. Classification only — do NOT compute any tax.',
                      },
                      cost: { type: Type.NUMBER, description: 'Optional per-unit COST (your cost basis). Provide cost + markup_pct INSTEAD of unit_price and the server computes the price. Do NOT compute the marked-up price yourself.' },
                      markup_pct: { type: Type.NUMBER, description: 'Optional markup percent applied to cost (e.g. 20 = 20%). The server computes unit_price = cost × (1 + markup_pct/100).' },
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
      contents: appendRetryHint(buildUserContent(input), input.retryHint),
      // AIREL-02/05: @google/genai's generateContent({model, contents, config})
      // takes a FLAT GenerateContentConfig — there is NO nested sub-object for
      // generation params (that shape belongs to the OLDER, DIFFERENT
      // @google/generative-ai package; an unknown key there is silently
      // ignored). maxOutputTokens/temperature MUST sit directly on this
      // config object or the SDK never reads them.
      config: {
        systemInstruction: buildSystemPrompt(input),
        tools: [{ functionDeclarations: [createEstimateDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['create_estimate'],
          },
        },
        // AIREL-02: symmetric output budget with OpenRouter's max_tokens 8192.
        maxOutputTokens: 8192,
        // AIREL-05: pinned to minimize run-to-run price/output variance — no
        // temperature was set anywhere on the estimate paths before this.
        temperature: 0.3,
      },
    })

    const fc = response.functionCalls?.[0]
    if (!fc) throw new Error('Gemini did not return a function call')
    const args = fc.args as Record<string, unknown>
    const r = normalizeOutput(args)
    if (!r.ok) throw new InvalidEstimateOutputError(r.error)
    // Cost-recording observability: this adapter is the SILENT fallback — it
    // serves the bulk of prod traffic whenever OpenRouter is unavailable, so a
    // missing/null cost here means credits never get debited (lib/billing/
    // credit-ledger.ts:83 treats null realCostUsd as "no debit"). Gemini's SDK
    // returns no USD cost directly, but DOES return token counts on
    // response.usageMetadata — computeGeminiCostUsd (lib/ai/pricing/gemini.ts,
    // quick-260821) prices those against Google's published rate card.
    // realCostUsd is a NUMBER whenever usageMetadata is present and the model
    // is priced; it falls back to NULL (never 0 — null-vs-0 discipline) only
    // when usage is missing/malformed. A null-cost row still COUNTS the event
    // ("served by gemini, cost unknown") vs "no row at all". AWAIT (not void):
    // mirrors openrouter.ts — inside an Inngest step a floating promise can be
    // dropped when the invocation freezes. recordAICost is internally
    // never-throw, so awaiting is safe and can never affect the estimate
    // return. Correlation ids come ONLY from the trusted, non-LLM costContext
    // (never from `args`).
    await recordAICost({
      attemptId: input.costContext?.attemptId ?? randomUUID(),
      operationType: 'estimate',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      realCostUsd: computeGeminiCostUsd('gemini-2.5-flash', response.usageMetadata),
      companyId: input.costContext?.companyId ?? null,
      projectId: input.costContext?.projectId ?? null,
    })
    return r.value
  }

  async refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput> {
    const apiKey = await getIntegrationKey('gemini')
    if (!apiKey) throw new Error('Gemini API key not configured')

    const ai = new GoogleGenAI({ apiKey })

    // HARD-02/UNIFY-02: refine reuses the SHARED prompt builder — no bespoke
    // prompt on the Gemini fallback path either (Pitfall 4). The instruction is
    // escaped + tagged via buildRefineUserContent.
    const refineInput = toRefineEstimateInput(input)
    const systemInstruction = buildSystemPrompt(refineInput, { mode: 'refine' })
    const userContent = appendRetryHint(
      buildRefineUserContent(refineInput, input.existingEstimate, input.instruction),
      input.retryHint
    )

    const createEstimateDeclaration = {
      name: 'create_estimate',
      description: 'Create a structured estimate with sections and line items',
      parameters: {
        type: Type.OBJECT,
        required: ['summary', 'sections', 'suggested_project_name', 'detected_trade'],
        properties: {
          suggested_project_name: { type: Type.STRING, description: 'Short professional project name. Return the same name unless the instruction changes it.' },
          detected_trade: {
            type: Type.STRING,
            description: 'The trade/category of the work. Return the same value unless the instruction changes the trade of the requested work.',
          },
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
                      taxable: {
                        type: Type.BOOLEAN,
                        description: 'true if this line item is taxable (default true if omitted).',
                      },
                      tax_category: {
                        type: Type.STRING,
                        // Gemini has no Type.ENUM — use STRING + description (zod schema enforces labor|materials|other)
                        description: 'Classify the work: "labor" for labor/service lines, "materials" for physical goods, "other" otherwise. Classification only — do NOT compute any tax.',
                      },
                      cost: { type: Type.NUMBER, description: 'Optional per-unit COST (your cost basis). Provide cost + markup_pct INSTEAD of unit_price and the server computes the price. Do NOT compute the marked-up price yourself.' },
                      markup_pct: { type: Type.NUMBER, description: 'Optional markup percent applied to cost (e.g. 20 = 20%). The server computes unit_price = cost × (1 + markup_pct/100).' },
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
      // AIREL-02/05: independent config from generateEstimate's above — see
      // that method's comment on the FLAT GenerateContentConfig shape (no
      // nested generation-params sub-object in @google/genai).
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [createEstimateDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['create_estimate'],
          },
        },
        // AIREL-02: symmetric output budget with OpenRouter's max_tokens 8192.
        maxOutputTokens: 8192,
        // AIREL-05: pinned to minimize run-to-run price/output variance.
        temperature: 0.3,
      },
    })

    const fc = response.functionCalls?.[0]
    if (!fc) throw new Error('Gemini did not return a function call')
    const args = fc.args as Record<string, unknown>
    const r = normalizeOutput(args)
    if (!r.ok) throw new InvalidEstimateOutputError(r.error)
    // Fix (refine credit attribution): RefineEstimateInput now carries the SAME
    // costContext shape as EstimateInput — mirrors generateEstimate's recordAICost
    // call above instead of always recording with null ids/a random attemptId.
    // realCostUsd priced from response.usageMetadata via computeGeminiCostUsd —
    // same rationale as generateEstimate above (null only when usage is
    // missing/malformed, never guessed).
    await recordAICost({
      attemptId: input.costContext?.attemptId ?? randomUUID(),
      operationType: 'estimate',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      realCostUsd: computeGeminiCostUsd('gemini-2.5-flash', response.usageMetadata),
      companyId: input.costContext?.companyId ?? null,
      projectId: input.costContext?.projectId ?? null,
    })
    return r.value
  }
}
