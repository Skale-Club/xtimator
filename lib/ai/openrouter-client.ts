/**
 * lib/ai/openrouter-client.ts
 *
 * Centralised AI helpers for the app. Estimates, vision, and translation route
 * through OpenRouter (openrouter.ai). Audio transcription is the one exception:
 * it calls OpenAI's Whisper endpoint (api.openai.com) directly — see
 * transcribeAudioOR for why.
 *
 * Endpoint coverage:
 *   openrouter.ai  /chat/completions     — estimates, refinement, vision, translation
 *   api.openai.com /audio/transcriptions — Whisper speech-to-text
 */

import { getIntegrationKey } from '@/lib/platform-config'
import { langfuseClient } from '@/lib/observability/langfuse'

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
export const OPENAI_TRANSCRIPTION_BASE = 'https://api.openai.com/v1'
/** OpenAI's standard, universally available Whisper model — the transcription primary. */
export const OPENAI_TRANSCRIPTION_MODEL = 'whisper-1'

/** Default model IDs — overridable via platform config or per-call argument. */
export const OR_DEFAULTS = {
  /** Best general-purpose model for estimates and vision. */
  chat: 'anthropic/claude-sonnet-4-5',
  /** Lightweight model for bulk translation — keeps costs low. */
  translation: 'anthropic/claude-haiku-4-5',
} as const

const SITE_HEADERS = {
  'HTTP-Referer': 'https://xtimator.com',
  'X-Title': 'Xtimator',
}

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
 * Transcribe audio to plain text via OpenAI's Whisper endpoint
 * (POST api.openai.com/v1/audio/transcriptions, model whisper-1).
 *
 * NAMING: the `OR` suffix is retained only so the three call sites
 * (transcribe-audio job, whatsapp-process, estimate refine) stay untouched.
 * Transcription does NOT route through OpenRouter — OpenRouter's audio endpoint
 * was unreliable for our usage, so transcription calls OpenAI directly. Vision
 * and translation in this module still use OpenRouter.
 *
 * Prefers an OpenAI key, read via getIntegrationKey('openai') which falls back
 * to the OPENAI_API_KEY env var (see lib/platform-config.ts). When NO OpenAI key
 * is configured, transcription falls back to Gemini (transcribeAudioGemini) using
 * the platform's existing Gemini key. Throws on any non-2xx or network failure so
 * Inngest's onFailure (ai_job.failed) surfaces it.
 */
export async function transcribeAudioOR(
  audioBlob: Blob,
  ext: string,
  model = OPENAI_TRANSCRIPTION_MODEL
): Promise<string> {
  const apiKey = await getIntegrationKey('openai')
  if (!apiKey) {
    // No OpenAI Whisper key configured — short-circuit straight to Gemini
    // multimodal transcription, which the platform already has set up. This
    // key-absent path is PRESERVED ahead of the failure-based fallback below.
    // Dynamic import keeps the Gemini SDK out of bundles that only use the
    // OpenRouter helpers.
    const { transcribeAudioGemini } = await import('@/lib/ai/providers/gemini')
    return transcribeAudioGemini(audioBlob, ext)
  }

  // Key-present primary: OpenAI Whisper. On failure, fall back to Gemini exactly
  // once via the shared provider-fallback policy (HARD-03).
  async function whisperPrimary(): Promise<string> {
    const startTime = new Date()
    const form = new FormData()
    form.append('file', audioBlob, `recording.${ext}`)
    form.append('model', model)
    form.append('response_format', 'text')

    const res = await fetch(`${OPENAI_TRANSCRIPTION_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown')
      throw new Error(`OpenAI transcription failed (${res.status}): ${err.slice(0, 400)}`)
    }

    const transcript = (await res.text()).trim()
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
    return transcript
  }

  const { callWithFallback } = await import('@/lib/ai/with-fallback')
  const { result } = await callWithFallback({
    op: 'transcribe',
    primary: whisperPrimary,
    fallback: async () => {
      const { transcribeAudioGemini } = await import('@/lib/ai/providers/gemini')
      return transcribeAudioGemini(audioBlob, ext)
    },
  })
  return result
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
  model?: string
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
    }

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...SITE_HEADERS,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown')
      throw new Error(`OpenRouter vision failed (${res.status}): ${err.slice(0, 400)}`)
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
      error?: { message?: string }
    }
    if (json.error?.message) throw new Error(`OpenRouter vision error: ${json.error.message}`)

    const result = json.choices?.[0]?.message?.content ?? ''
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
  model = OR_DEFAULTS.translation
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
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...SITE_HEADERS,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    throw new Error(`OpenRouter translation failed (${res.status}): ${err.slice(0, 400)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
    error?: { message?: string }
  }
  if (json.error?.message) throw new Error(`OpenRouter translation error: ${json.error.message}`)

  const raw = json.choices?.[0]?.message?.content ?? '{}'
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const result = JSON.parse(clean) as Record<string, string>
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
