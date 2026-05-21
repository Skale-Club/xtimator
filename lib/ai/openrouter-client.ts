/**
 * lib/ai/openrouter-client.ts
 *
 * Centralised OpenRouter helpers for every AI task in the app.
 * All features (estimates, transcription, vision, translation) route through
 * this single module so there is exactly ONE external AI endpoint: openrouter.ai
 *
 * Endpoint coverage:
 *   /chat/completions  — estimates, refinement, vision, translation
 *   /audio/transcriptions — Whisper speech-to-text (OpenAI-compatible endpoint)
 */

import { getIntegrationKey } from '@/lib/platform-config'

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

/** Default model IDs — overridable via platform config or per-call argument. */
export const OR_DEFAULTS = {
  /** Best general-purpose model for estimates and vision. */
  chat: 'anthropic/claude-sonnet-4-5',
  /** Lightweight model for bulk translation — keeps costs low. */
  translation: 'anthropic/claude-haiku-4-5',
  /** Best price/performance Whisper variant on OpenRouter. */
  transcription: 'openai/whisper-large-v3-turbo',
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
 * Transcribe audio via OpenRouter's Whisper endpoint (OpenAI-compatible).
 * Returns the plain-text transcript.
 */
export async function transcribeAudioOR(
  audioBlob: Blob,
  ext: string,
  model = OR_DEFAULTS.transcription
): Promise<string> {
  const apiKey = await getORKey()

  const form = new FormData()
  form.append('file', audioBlob, `recording.${ext}`)
  form.append('model', model)
  form.append('response_format', 'text')

  const res = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...SITE_HEADERS,
    },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    throw new Error(`OpenRouter transcription failed (${res.status}): ${err.slice(0, 400)}`)
  }

  return (await res.text()).trim()
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

  return json.choices?.[0]?.message?.content ?? ''
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
  return JSON.parse(clean) as Record<string, string>
}
