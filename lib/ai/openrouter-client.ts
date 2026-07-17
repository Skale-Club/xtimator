/**
 * lib/ai/openrouter-client.ts
 *
 * Centralised AI helpers for the app. Every AI task routes through OpenRouter
 * (openrouter.ai) on a single key: estimates, vision, translation, AND audio
 * transcription. Transcription keeps OpenAI's own endpoint as a FALLBACK only
 * (the proven pre-migration path) — see transcribeAudioOR.
 *
 * Endpoint coverage:
 *   openrouter.ai  /chat/completions     — estimates, refinement, vision, translation
 *   openrouter.ai  /audio/transcriptions — speech-to-text (primary)
 *   api.openai.com /audio/transcriptions — speech-to-text (fallback only)
 */

import { randomUUID } from 'node:crypto'
import { getIntegrationKey } from '@/lib/platform-config'
import { langfuseClient } from '@/lib/observability/langfuse'
import { recordAICost } from '@/lib/billing/record-ai-cost'

/**
 * Phase 110 (COST-01): non-LLM cost-correlation context. Optional/additive on the
 * vision + translation call sites — absent → cost still captured with null ids.
 */
type CostContext = {
  attemptId?: string | null
  companyId?: string | null
  projectId?: string | null
}

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
/** OpenAI's own transcription base — used ONLY by the fallback path now. */
export const OPENAI_TRANSCRIPTION_BASE = 'https://api.openai.com/v1'
/** Default transcription model — an OpenRouter slug routed to OpenAI Whisper. */
export const DEFAULT_TRANSCRIBE_MODEL = 'openai/whisper-1'

/** Default model IDs — overridable via platform config or per-call argument. */
export const OR_DEFAULTS = {
  /** Best general-purpose model for estimates and vision. */
  chat: 'anthropic/claude-sonnet-5',
  /** Lightweight model for bulk translation — keeps costs low. */
  translation: 'anthropic/claude-haiku-4-5',
} as const

const SITE_HEADERS = {
  'HTTP-Referer': 'https://xtimator.com',
  'X-Title': 'Xtimator',
}

/**
 * Request timeouts (ms) for the raw fetch AI calls. Without a signal a hung
 * upstream connection would keep the request (and any Inngest step / route
 * handler) open indefinitely. Budgets are deliberately generous — a too-short
 * timeout that aborts a still-progressing request is worse than none.
 *   - chat/vision/translation: 120s (a single completion).
 *   - transcription: 300s (long job-site audio can legitimately take minutes).
 * AbortSignal.timeout(...) rejects the fetch with a TimeoutError, which surfaces
 * as a thrown error through the existing !res.ok / callWithFallback / caller
 * catch paths — same handling as any other network failure.
 *
 * AIREL-01: `AI_CHAT_TIMEOUT_MS` is EXPORTED so the primary estimate-generation
 * call (`lib/ai/providers/openrouter.ts`) and the best-effort classification
 * call (`lib/ai/needs-details.ts`) import this SAME constant rather than
 * duplicating the number — single source of truth for the 120s chat budget.
 */
export const AI_CHAT_TIMEOUT_MS = 120_000
const AI_TRANSCRIBE_TIMEOUT_MS = 300_000

/** Fetch and validate the OpenRouter API key. Throws if not configured. */
export async function getORKey(): Promise<string> {
  const key = await getIntegrationKey('openrouter')
  if (!key) throw new Error('OpenRouter API key not configured')
  return key
}

// ---------------------------------------------------------------------------
// Audio transcription
// ---------------------------------------------------------------------------

/**
 * Transcribe audio to plain text.
 *
 * PRIMARY — OpenRouter's dedicated transcription endpoint
 *   POST openrouter.ai/api/v1/audio/transcriptions
 * with a base64 JSON body ({ model, input_audio: { data, format } }). One key
 * for every AI task: the OpenRouter key powers speech-to-text too. Model ids are
 * OpenRouter slugs (openai/whisper-1, openai/gpt-4o-transcribe, …); a bare legacy
 * id (whisper-1) is prefixed with `openai/` so values saved before the migration
 * keep working with no DB change.
 *
 * FALLBACK — OpenAI's own /v1/audio/transcriptions (multipart), keyed by
 * getIntegrationKey('openai'). This is the previously-shipped path; keeping it as
 * the fallback means this migration can NEVER regress below prior behavior — an
 * earlier OpenRouter-STT migration was reverted for 500s (it used the wrong
 * multipart shape against the OR endpoint + had no key), and the fallback removes
 * that risk entirely.
 *
 * On BOTH failing, callWithFallback throws ProvidersUnavailableError so Inngest's
 * onFailure (ai_job.failed) surfaces it. The `OR` suffix now reflects reality:
 * transcription routes through OpenRouter.
 */
export async function transcribeAudioOR(
  audioBlob: Blob,
  ext: string,
  model = DEFAULT_TRANSCRIBE_MODEL
): Promise<string> {
  // OpenRouter needs a vendor-prefixed slug; OpenAI's own API needs the bare id.
  const orModel = model.includes('/') ? model : `openai/${model}`
  const openaiModel = orModel.replace(/^openai\//, '')

  // PRIMARY — OpenRouter transcription (base64 JSON body, NOT multipart).
  async function openrouterPrimary(): Promise<string> {
    const apiKey = await getORKey()
    const startTime = new Date()
    const base64 = Buffer.from(await audioBlob.arrayBuffer()).toString('base64')

    const res = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...SITE_HEADERS,
      },
      body: JSON.stringify({
        model: orModel,
        input_audio: { data: base64, format: ext },
      }),
      signal: AbortSignal.timeout(AI_TRANSCRIBE_TIMEOUT_MS),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown')
      throw new Error(`OpenRouter transcription failed (${res.status}): ${err.slice(0, 400)}`)
    }

    const json = (await res.json()) as {
      text?: string
      error?: { message?: string }
    }
    if (json.error?.message) {
      throw new Error(`OpenRouter transcription error: ${json.error.message}`)
    }
    const transcript = (json.text ?? '').trim()
    await traceTranscription(orModel, ext, transcript, startTime)
    return transcript
  }

  // FALLBACK — OpenAI direct (multipart), the proven pre-migration path.
  async function openaiFallback(): Promise<string> {
    const apiKey = await getIntegrationKey('openai')
    if (!apiKey) throw new Error('OpenAI transcription key not configured')
    const startTime = new Date()
    const form = new FormData()
    form.append('file', audioBlob, `recording.${ext}`)
    form.append('model', openaiModel)
    form.append('response_format', 'text')

    const res = await fetch(`${OPENAI_TRANSCRIPTION_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(AI_TRANSCRIBE_TIMEOUT_MS),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown')
      throw new Error(`OpenAI transcription failed (${res.status}): ${err.slice(0, 400)}`)
    }
    const transcript = (await res.text()).trim()
    await traceTranscription(openaiModel, ext, transcript, startTime)
    return transcript
  }

  const { callWithFallback } = await import('@/lib/ai/with-fallback')
  const { result } = await callWithFallback({
    op: 'transcribe',
    primary: openrouterPrimary,
    fallback: openaiFallback,
  })
  // D1 guard (quick-260705-2gp): an empty-but-HTTP-ok response is a wrapper
  // "success" (the fallback is not consulted for it) — genuinely silent audio
  // returns '' from both providers anyway. Throw AFTER the wrapper so the
  // failure propagates out of step.run('whisper-transcribe') and the Inngest
  // onFailure (ai_job.failed) surfaces a CLEAR message instead of a silent
  // empty save + credit charge.
  if (result.trim().length === 0) {
    throw new Error('Transcription produced no text — no speech detected in the audio')
  }
  return result
}

/** Best-effort Langfuse trace for a transcription call (never throws). */
async function traceTranscription(
  model: string,
  ext: string,
  transcript: string,
  startTime: Date
): Promise<void> {
  try {
    const gen = langfuseClient.generation({
      name: 'transcribe_audio',
      model,
      input: { ext, model },
      startTime,
    })
    gen.end({ output: { chars: transcript.length }, endTime: new Date() })
    await langfuseClient.flushAsync()
  } catch (err) {
    console.warn('[langfuse] transcribe_audio trace failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Photo / vision analysis
// ---------------------------------------------------------------------------

/**
 * Shared vision prompt. Exported so the Gemini vision fallback
 * (`analyzePhotoGemini`) imports the SAME constant — no duplication.
 */
export const PHOTO_PROMPT =
  "Describe this photo from a contractor's perspective. Note materials, conditions, measurements if visible, damage, and areas needing work. Be specific and concise."

/**
 * Analyse a single photo via OpenRouter chat completions (vision).
 * `base64` is the raw base64 string; `mimeType` is e.g. "image/jpeg".
 */
export async function analyzePhotoOR(
  base64: string,
  mimeType: string,
  model?: string,
  costContext?: CostContext
): Promise<string> {
  // Primary: OpenRouter vision. On failure, fall back to Gemini vision exactly
  // once via the shared provider-fallback policy (HARD-03).
  async function visionPrimary(): Promise<string> {
    const apiKey = await getORKey()
    const visionModel = model ?? OR_DEFAULTS.chat
    const startTime = new Date()

    const body = {
      model: visionModel,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            { type: 'text', text: PHOTO_PROMPT },
          ],
        },
      ],
      // COST-01: request the real upstream USD cost in the response usage block.
      usage: { include: true },
    }

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...SITE_HEADERS,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown')
      throw new Error(`OpenRouter vision failed (${res.status}): ${err.slice(0, 400)}`)
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
      error?: { message?: string }
      // Phase 110 (COST-01): real USD cost returned automatically (no flag).
      usage?: { cost?: number }
    }
    if (json.error?.message) throw new Error(`OpenRouter vision error: ${json.error.message}`)

    const result = json.choices?.[0]?.message?.content ?? ''
    // Phase 110 (COST-01): capture the vision call's real USD cost. null when
    // absent (NEVER 0). Correlation ids come ONLY from the non-LLM costContext.
    // AWAIT (not void): a floating promise is dropped when an Inngest step
    // suspends, leaving ai_cost_events empty. recordAICost never-throws, so
    // awaiting it can never affect the return.
    await recordAICost({
      attemptId: costContext?.attemptId ?? randomUUID(),
      operationType: 'vision',
      provider: 'openrouter',
      model: visionModel,
      realCostUsd: json.usage?.cost ?? null,
      companyId: costContext?.companyId ?? null,
      projectId: costContext?.projectId ?? null,
    })
    try {
      const gen = langfuseClient.generation({
        name: 'analyze_photo',
        model: visionModel,
        input: { mimeType, prompt: PHOTO_PROMPT },
        startTime,
      })
      gen.end({ output: result.slice(0, 500), endTime: new Date() })
      await langfuseClient.flushAsync()
    } catch (err) {
      console.warn('[langfuse] analyze_photo trace failed:', err)
    }
    return result
  }

  const { callWithFallback } = await import('@/lib/ai/with-fallback')
  const { result } = await callWithFallback({
    op: 'vision',
    primary: visionPrimary,
    fallback: async () => {
      const { analyzePhotoGemini } = await import('@/lib/ai/providers/gemini')
      return analyzePhotoGemini(base64, mimeType)
    },
  })
  // D2 guard (quick-260705-2gp): same rationale as the transcription guard —
  // an empty-but-HTTP-ok analysis is a wrapper "success", so throw after the
  // wrapper to fail loudly instead of silently feeding the estimate zero
  // photo context.
  if (result.trim().length === 0) {
    throw new Error('Photo analysis produced no description')
  }
  return result
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/**
 * Translate an array of UI strings via OpenRouter.
 * Returns a map of source → translated text.
 * Throws on network / parse failure — caller should catch and fall back.
 */
export async function translateTextsOR(
  texts: string[],
  targetLanguage: 'pt' | 'es',
  model = OR_DEFAULTS.translation,
  costContext?: CostContext
): Promise<Record<string, string>> {
  const apiKey = await getORKey()
  const startTime = new Date()
  const langLabel =
    targetLanguage === 'pt' ? 'Brazilian Portuguese (PT-BR)' : 'Latin American Spanish (ES)'

  const body = {
    model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Translate these UI strings from English to ${langLabel}. Return ONLY a raw JSON object (no markdown, no code blocks) mapping each source string exactly to its translation. Keep proper nouns and brand names unchanged. Preserve casing style. Source strings:\n${JSON.stringify(texts)}`,
      },
    ],
    // COST-01: request the real upstream USD cost in the response usage block.
    usage: { include: true },
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...SITE_HEADERS,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    throw new Error(`OpenRouter translation failed (${res.status}): ${err.slice(0, 400)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
    error?: { message?: string }
    // Phase 110 (COST-01): real USD cost returned automatically (no flag).
    usage?: { cost?: number }
  }
  if (json.error?.message) throw new Error(`OpenRouter translation error: ${json.error.message}`)

  const raw = json.choices?.[0]?.message?.content ?? '{}'
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const result = JSON.parse(clean) as Record<string, string>
  // Phase 110 (COST-01): capture the translation call's real USD cost. null when
  // absent (NEVER 0). Correlation ids come ONLY from the non-LLM costContext.
  // AWAIT (not void): a floating promise is dropped when an Inngest step
  // suspends, leaving ai_cost_events empty. recordAICost never-throws.
  await recordAICost({
    attemptId: costContext?.attemptId ?? randomUUID(),
    operationType: 'translation',
    provider: 'openrouter',
    model,
    realCostUsd: json.usage?.cost ?? null,
    companyId: costContext?.companyId ?? null,
    projectId: costContext?.projectId ?? null,
  })
  try {
    const gen = langfuseClient.generation({
      name: 'translate_texts',
      model,
      input: { count: texts.length, targetLanguage },
      startTime,
    })
    gen.end({ output: { keys: Object.keys(result) }, endTime: new Date() })
    await langfuseClient.flushAsync()
  } catch (err) {
    console.warn('[langfuse] translate_texts trace failed:', err)
  }
  return result
}
