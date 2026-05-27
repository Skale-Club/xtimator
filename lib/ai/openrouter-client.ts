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
export const OPENAI_TRANSCRIPTION_BASE = 'https://api.openai.com/v1'
/** OpenAI's standard, universally available Whisper model — used as 5xx fallback. */
export const OPENAI_FALLBACK_MODEL = 'whisper-1'

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
 * Module-internal fallback: hit OpenAI's own /v1/audio/transcriptions endpoint
 * directly. Used by transcribeAudioOR when OpenRouter returns 5xx twice in a
 * row OR throws (network error). The user has OPENAI_API_KEY in .env.local
 * which getIntegrationKey('openai') reads as a fallback (see lib/platform-config.ts:207),
 * so this requires zero extra configuration.
 *
 * Throws if the OpenAI key is unavailable or the OpenAI call fails — callers
 * MUST surface both the original OpenRouter failure and this failure together.
 */
async function transcribeViaOpenAIDirect(
  audioBlob: Blob,
  ext: string
): Promise<string> {
  const apiKey = await getIntegrationKey('openai')
  if (!apiKey) {
    throw new Error('OpenAI API key not configured (checked platform_integrations and OPENAI_API_KEY env)')
  }

  const form = new FormData()
  form.append('file', audioBlob, `recording.${ext}`)
  form.append('model', OPENAI_FALLBACK_MODEL)
  form.append('response_format', 'text')

  const res = await fetch(`${OPENAI_TRANSCRIPTION_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // NOTE: no HTTP-Referer / X-Title — those are OpenRouter-specific headers.
    },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    throw new Error(`OpenAI direct transcription failed (${res.status}): ${err.slice(0, 400)}`)
  }

  return (await res.text()).trim()
}

/**
 * OpenRouter intermittently returns `401 {"message":"User not found","code":401}`
 * on the transcription endpoint even for a valid, funded key — a spurious glitch
 * on its auth/credit-lookup side that resolves on retry (symptom: "fails then works").
 * Treat ONLY this exact shape as transient so it flows into the retry + OpenAI
 * fallback path instead of throwing immediately. Any other 401 (different message)
 * or other 4xx remains a hard, immediately-thrown error.
 */
function isTransientORAuthGlitch(status: number, body: string): boolean {
  return status === 401 && /user not found/i.test(body)
}

/**
 * Transcribe audio via OpenRouter's Whisper endpoint (OpenAI-compatible).
 * Returns the plain-text transcript.
 *
 * Hardened against OpenRouter outages:
 *   - On 5xx: retries once after ~500ms.
 *   - On persistent 5xx OR network error: falls back to OpenAI's own
 *     /v1/audio/transcriptions endpoint (whisper-1).
 *   - On 4xx: throws immediately (real config/auth bugs must not be masked) —
 *     EXCEPT a spurious OpenRouter `401 User not found`, which is treated as
 *     transient and flows into the retry + OpenAI fallback path.
 *
 * Exported signature is preserved so callers (lib/inngest/functions/transcribe-audio.ts)
 * stay untouched.
 */
export async function transcribeAudioOR(
  audioBlob: Blob,
  ext: string,
  model = OR_DEFAULTS.transcription
): Promise<string> {
  const apiKey = await getORKey()

  const buildForm = (): FormData => {
    // Rebuild the FormData per attempt — some runtimes mark FormData bodies as
    // consumed after fetch; rebuilding is cheap and avoids subtle bugs.
    const f = new FormData()
    f.append('file', audioBlob, `recording.${ext}`)
    f.append('model', model)
    f.append('response_format', 'text')
    return f
  }

  const callOpenRouter = async (): Promise<Response> => {
    return await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...SITE_HEADERS,
      },
      body: buildForm(),
    })
  }

  // ---- Attempt 1: OpenRouter ----
  // Capture the OpenRouter failure mode so we can include it in the final
  // composite error if BOTH paths end up failing.
  let orFailure: string | null = null

  try {
    const res = await callOpenRouter()
    if (res.ok) {
      return (await res.text()).trim()
    }

    // 4xx = our fault (auth, payload, model id) → throw immediately, do NOT
    // mask the real bug by falling back to OpenAI. The one exception is a
    // spurious OpenRouter `401 User not found`, which is transient: record it
    // and fall through to the retry + OpenAI fallback path instead of throwing.
    if (res.status >= 400 && res.status < 500) {
      const err = await res.text().catch(() => 'unknown')
      if (isTransientORAuthGlitch(res.status, err)) {
        orFailure = `OpenRouter ${res.status} (transient): ${err.slice(0, 200)}`
      } else {
        throw new Error(`OpenRouter transcription failed (${res.status}): ${err.slice(0, 400)}`)
      }
    }

    // 5xx → record and proceed to retry-then-fallback.
    const err = await res.text().catch(() => 'unknown')
    orFailure = `OpenRouter ${res.status}: ${err.slice(0, 200)}`
  } catch (e) {
    // Re-throw 4xx errors thrown above — they have the right shape already.
    if (e instanceof Error && e.message.startsWith('OpenRouter transcription failed (4')) {
      throw e
    }
    // Network error (fetch itself threw) — treat like a 5xx for retry purposes.
    orFailure = `OpenRouter network error: ${e instanceof Error ? e.message : String(e)}`
  }

  // ---- Attempt 2: OpenRouter retry after ~500ms ----
  await new Promise((r) => setTimeout(r, 500))
  try {
    const res = await callOpenRouter()
    if (res.ok) {
      return (await res.text()).trim()
    }

    // 4xx on retry — still a real bug, throw without OpenAI fallback. The one
    // exception is a spurious OpenRouter `401 User not found`: record it and
    // fall through to the OpenAI direct fallback instead of throwing.
    if (res.status >= 400 && res.status < 500) {
      const err = await res.text().catch(() => 'unknown')
      if (isTransientORAuthGlitch(res.status, err)) {
        orFailure = `${orFailure} | retry ${res.status} (transient): ${err.slice(0, 200)}`
      } else {
        throw new Error(`OpenRouter transcription failed on retry (${res.status}): ${err.slice(0, 400)}`)
      }
    }

    const err = await res.text().catch(() => 'unknown')
    orFailure = `${orFailure} | retry ${res.status}: ${err.slice(0, 200)}`
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('OpenRouter transcription failed on retry (4')) {
      throw e
    }
    orFailure = `${orFailure} | retry network error: ${e instanceof Error ? e.message : String(e)}`
  }

  // ---- Attempt 3: OpenAI direct fallback ----
  console.warn(
    `[openrouter-client] OpenRouter transcription unavailable after retry — falling back to OpenAI direct (${OPENAI_FALLBACK_MODEL}). OpenRouter failure: ${orFailure}`
  )

  try {
    return await transcribeViaOpenAIDirect(audioBlob, ext)
  } catch (fallbackErr) {
    // Surface BOTH failure modes in one error message so Inngest's onFailure
    // notification (ai_job.failed) tells the dev which paths failed and why.
    const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
    throw new Error(
      `Transcription failed on both providers. ${orFailure}. ${fbMsg}`
    )
  }
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
