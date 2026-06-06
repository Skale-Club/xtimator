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
import { getLangfuse } from '@/lib/observability/langfuse'

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
 * Requires an OpenAI key, read via getIntegrationKey('openai') which falls back
 * to the OPENAI_API_KEY env var (see lib/platform-config.ts). Throws on any
 * non-2xx or network failure so Inngest's onFailure (ai_job.failed) surfaces it.
 */
export async function transcribeAudioOR(
  audioBlob: Blob,
  ext: string,
  model = OPENAI_TRANSCRIPTION_MODEL
): Promise<string> {
  const apiKey = await getIntegrationKey('openai')
  if (!apiKey) {
    throw new Error(
      'OpenAI API key not configured (checked platform_integrations and OPENAI_API_KEY env)'
    )
  }

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
    const lf = getLangfuse()
    if (lf) {
      const trace = lf.trace({ name: 'transcribe_audio' })
      trace.span({
        name: 'transcribe_audio',
        input: { ext, model },
        output: transcript.slice(0, 200),
        startTime,
        endTime: new Date(),
      })
    }
  } catch (err) {
    console.warn('[langfuse] transcribe_audio trace failed:', err)
  }
  return transcript
}

// ---------------------------------------------------------------------------
// Photo / vision analysis
// ---------------------------------------------------------------------------

const PHOTO_PROMPT =
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
    const lf = getLangfuse()
    if (lf) {
      const trace = lf.trace({ name: 'analyze_photo' })
      trace.generation({
        name: 'analyze_photo',
        model: visionModel,
        input: { mimeType, prompt: PHOTO_PROMPT },
        output: result,
        startTime,
        endTime: new Date(),
      })
    }
  } catch (err) {
    console.warn('[langfuse] analyze_photo trace failed:', err)
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
    const lf = getLangfuse()
    if (lf) {
      const trace = lf.trace({ name: 'translate_texts' })
      trace.generation({
        name: 'translate_texts',
        model,
        input: { texts, targetLanguage },
        output: result,
        startTime,
        endTime: new Date(),
      })
    }
  } catch (err) {
    console.warn('[langfuse] translate_texts trace failed:', err)
  }
  return result
}
