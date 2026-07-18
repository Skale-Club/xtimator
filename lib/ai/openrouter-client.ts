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
import { TruncatedOutputError } from '@/lib/ai/with-fallback'
import { photoExtractionSchema, photoExtractionToolSchema, type PhotoExtraction } from '@/lib/ai/photo-extraction-schema'

/**
 * Phase 110 (COST-01): non-LLM cost-correlation context. Optional/additive on the
 * vision + translation call sites — absent → cost still captured with null ids.
 * Exported (Phase 171/PEXT-05) so the Gemini structured-extraction sibling
 * (lib/ai/providers/gemini.ts's analyzePhotoStructuredGemini) shares the SAME
 * shape instead of a duplicated inline type.
 */
export type CostContext = {
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
 *
 * Phase 167 (BILL-05/D5): returns `{ text, servedBy }` — previously the caller
 * had no way to know which provider actually served the transcription (the
 * fallback is entirely hidden inside `callWithFallback`), so every job/route
 * hardcoded provider attribution to 'openrouter' even when the OpenAI-direct
 * fallback fired. `callWithFallback` already computes `servedBy`; this just
 * stops discarding it. BOTH consumers were updated for this shape change:
 * lib/inngest/functions/transcribe-audio.ts and
 * lib/estimate/ingest/multimodal.ts (grep confirms no third consumer).
 */
export async function transcribeAudioOR(
  audioBlob: Blob,
  ext: string,
  model = DEFAULT_TRANSCRIBE_MODEL
): Promise<{ text: string; servedBy: 'primary' | 'fallback' }> {
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
  const { result, servedBy } = await callWithFallback({
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
  return { text: result, servedBy }
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

/** Base output cap (Phase 168 PHOTO-04, raised from 300 — audit E4). */
const VISION_BASE_MAX_TOKENS = 450
/** One-shot retry cap when the base attempt truncates (finish_reason 'length'). */
const VISION_RETRY_MAX_TOKENS = 600

/**
 * Trims trailing partial-sentence text at the LAST sentence-ending
 * punctuation (`.`, `!`, `?`) found in the string. Used ONLY as the
 * last-resort fallback when a vision response is still truncated
 * (finish_reason 'length') after the one retry at a higher cap — a
 * mid-sentence cutoff must never be persisted verbatim (Phase 168 PHOTO-04).
 * When no sentence-ending punctuation exists at all, returns the trimmed
 * text unchanged (nothing to safely cut to; the empty-output guard downstream
 * still catches a genuinely blank result).
 */
function trimToSentenceBoundary(text: string): string {
  const trimmed = text.trimEnd()
  let lastIdx = -1
  for (const punct of ['.', '!', '?']) {
    const idx = trimmed.lastIndexOf(punct)
    if (idx > lastIdx) lastIdx = idx
  }
  if (lastIdx === -1) return trimmed
  return trimmed.slice(0, lastIdx + 1)
}

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

    // Phase 168 (PHOTO-04, audit E4): a single completion attempt at the given
    // max_tokens cap. Extracted so the truncation retry below can re-issue the
    // IDENTICAL request shape at a higher cap without duplicating it.
    async function completeVision(maxTokens: number): Promise<{
      content: string
      finishReason: string | null
      costUsd: number | null
    }> {
      const body = {
        model: visionModel,
        max_tokens: maxTokens,
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
        choices?: Array<{
          message?: { content?: string | null }
          // Phase 168 (PHOTO-04): read to detect a mid-sentence truncation —
          // disjoint from 166-01's separate providers/openrouter.ts type.
          finish_reason?: string | null
        }>
        error?: { message?: string }
        // Phase 110 (COST-01): real USD cost returned automatically (no flag).
        usage?: { cost?: number }
      }
      if (json.error?.message) throw new Error(`OpenRouter vision error: ${json.error.message}`)

      return {
        content: json.choices?.[0]?.message?.content ?? '',
        finishReason: json.choices?.[0]?.finish_reason ?? null,
        costUsd: json.usage?.cost ?? null,
      }
    }

    // Phase 168 (PHOTO-04, audit E4): base cap 450 (was 300, never read
    // finish_reason). On 'length', retry ONCE at a higher cap (600); if STILL
    // truncated, trim at the last sentence boundary rather than persist a
    // mid-sentence cut. recordAICost fires exactly ONCE below, for whichever
    // attempt is final (never once per attempt).
    let attempt = await completeVision(VISION_BASE_MAX_TOKENS)
    if (attempt.finishReason === 'length') {
      attempt = await completeVision(VISION_RETRY_MAX_TOKENS)
      if (attempt.finishReason === 'length') {
        attempt = { ...attempt, content: trimToSentenceBoundary(attempt.content) }
      }
    }
    const result = attempt.content

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
      realCostUsd: attempt.costUsd,
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
// Structured photo extraction (Phase 171 — PEXT-01/03/04/05)
// ---------------------------------------------------------------------------

/**
 * PEXT: dedicated timeout for the STRUCTURED extraction attempts ONLY
 * (analyzePhotoStructuredOR below + analyzePhotoStructuredGemini in
 * lib/ai/providers/gemini.ts) — deliberately NOT `AI_CHAT_TIMEOUT_MS` (120s).
 * The worker's fallback ladder can stack up to FOUR provider calls in one
 * Inngest step (structured-OR -> structured-Gemini -> prose-OR -> prose-
 * Gemini); 4x120s would blow the step's time budget before the prose safety
 * net (today's already-proven path) even runs. Structured attempts are
 * best-effort — 40s each bounds the worst case while prose keeps its
 * existing, untouched timeouts.
 */
export const STRUCTURED_VISION_TIMEOUT_MS = 40_000
/** Sizing per audit § E5 — richer output than the prose path's 450 base cap. */
export const STRUCTURED_VISION_MAX_TOKENS = 700

/**
 * PEXT: structured-extraction prompt — a superset of PHOTO_PROMPT's
 * contractor framing plus explicit measurement/confidence guidance so the
 * forced tool-call has a fighting chance of populating `measurements[].value`
 * with a defensible confidence tag instead of guessing silently. Exported so
 * `analyzePhotoStructuredGemini` (gemini.ts) uses the SAME instruction text —
 * no duplicated/diverging prompt.
 */
export const PHOTO_EXTRACTION_PROMPT =
  "Describe this photo from a contractor's perspective and extract structured " +
  'details via the extract_photo tool: surfaces (with material and condition), ' +
  'measurements (dimension, value, unit, subject), materials, visible damage ' +
  '(with severity), and trade signals. Extract every visible or reasonably ' +
  "estimable measurement with its unit; mark confidence 'stated' only when a " +
  'dimension is readable in the image (tape measure, plans, labels), else ' +
  "'estimated'. Always populate overall_description with a concise summary."

/**
 * PEXT-04 marker error thrown when a structured extraction tool-call's parsed
 * arguments fail `photoExtractionSchema` (the ONE authoritative gate — see
 * `validatePhotoExtraction` below). Distinct from `InvalidEstimateOutputError`
 * (estimate-only) and from `TruncatedOutputError` (finish_reason length) — the
 * worker's fallback ladder treats all three the same way (fall through to the
 * next rung), but a typed name aids diagnosis in logs.
 */
export class InvalidPhotoExtractionError extends Error {
  readonly invalidPhotoExtraction = true as const
  constructor(readonly zodError: import('zod').ZodError) {
    super('Structured photo extraction failed schema validation')
    this.name = 'InvalidPhotoExtractionError'
  }
}

/**
 * PEXT-04 — the ONE authoritative zod gate. Both `analyzePhotoStructuredOR`
 * (below) and `analyzePhotoStructuredGemini` (lib/ai/providers/gemini.ts)
 * funnel their raw parsed tool-call arguments through this SINGLE function
 * rather than each calling `photoExtractionSchema.safeParse` independently —
 * the parity test (d) locks drift by construction (one call site, not two
 * independently-maintained ones) rather than merely asserting two separately
 * written calls happen to agree today.
 */
export function validatePhotoExtraction(raw: unknown): PhotoExtraction {
  const result = photoExtractionSchema.safeParse(raw)
  if (!result.success) throw new InvalidPhotoExtractionError(result.error)
  return result.data
}

/**
 * Structured sibling of `analyzePhotoOR` above — forces a tool-call
 * ('extract_photo') on the platform vision model so the response is a typed,
 * validated `PhotoExtraction` instead of prose. This is a NEW call path, not a
 * modification of `analyzePhotoOR`: the prose ladder above stays completely
 * untouched as the worker's terminal fallback (both `PHOTO_STRUCTURED_
 * EXTRACTION=off` and a total structured failure degrade to it byte-
 * identically — PEXT-03).
 *
 * NO internal retry — the worker's structured(OR) -> structured(Gemini) ->
 * prose ladder IS the retry. One attempt, one outcome: a validated
 * `PhotoExtraction` or a thrown (typed where possible) error.
 */
export async function analyzePhotoStructuredOR(
  base64: string,
  mimeType: string,
  model?: string,
  costContext?: CostContext
): Promise<PhotoExtraction> {
  const apiKey = await getORKey()
  const visionModel = model ?? OR_DEFAULTS.chat
  const startTime = new Date()

  const body = {
    model: visionModel,
    max_tokens: STRUCTURED_VISION_MAX_TOKENS,
    // PEXT: pinned like the estimate paths (166-01/AIREL-05) — minimizes
    // run-to-run variance for a call whose whole point is a consistent shape.
    temperature: 0.3,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
          { type: 'text', text: PHOTO_EXTRACTION_PROMPT },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'extract_photo',
          description:
            'Extract structured surfaces/measurements/materials/damage from a job-site photo.',
          parameters: photoExtractionToolSchema(),
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'extract_photo' } },
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
    // PEXT: the dedicated 40s structured budget, NOT AI_CHAT_TIMEOUT_MS — see
    // STRUCTURED_VISION_TIMEOUT_MS's comment above.
    signal: AbortSignal.timeout(STRUCTURED_VISION_TIMEOUT_MS),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    throw new Error(`OpenRouter structured vision failed (${res.status}): ${err.slice(0, 400)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>
      }
      finish_reason?: string | null
    }>
    error?: { message?: string }
    usage?: { cost?: number }
  }
  if (json.error?.message) {
    throw new Error(`OpenRouter structured vision error: ${json.error.message}`)
  }

  const choice = json.choices?.[0]
  const toolCall = choice?.message?.tool_calls?.find((t) => t.function?.name === 'extract_photo')
  const argsJson = toolCall?.function?.arguments
  const finishReason = choice?.finish_reason ?? null
  const costUsd = json.usage?.cost ?? null

  // COST ORDERING (Opus plan-check #1): once the model made a genuine
  // tool-call ATTEMPT (argsJson present — even if truncated or later found
  // schema-invalid), record the real cost BEFORE any of the failure branches
  // below. A billable response that fails finish_reason/parse/the zod gate
  // (the COMMON structured failure mode) still cost real money and MUST land
  // in ai_cost_events — this ordering is what test (c) locks. A response with
  // NO tool-call attempt at all (the model fully ignored the forced
  // tool_choice) is not recorded here, mirroring the pre-existing estimate
  // callTool convention (lib/ai/providers/openrouter.ts: its `!argsJson`
  // guard also precedes any cost recording there).
  if (argsJson !== undefined) {
    await recordAICost({
      attemptId: costContext?.attemptId ?? randomUUID(),
      operationType: 'vision',
      provider: 'openrouter',
      model: visionModel,
      realCostUsd: costUsd,
      companyId: costContext?.companyId ?? null,
      projectId: costContext?.projectId ?? null,
    })
  }

  if (finishReason === 'length') {
    throw new TruncatedOutputError('analyze_photo_structured')
  }
  if (argsJson === undefined) {
    throw new Error(
      `OpenRouter did not return a structured extraction tool call from model ${visionModel}`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(argsJson)
  } catch {
    throw new Error('OpenRouter returned malformed structured-extraction tool-call arguments')
  }

  const result = validatePhotoExtraction(parsed)
  try {
    const gen = langfuseClient.generation({
      name: 'analyze_photo_structured',
      model: visionModel,
      input: { mimeType, prompt: PHOTO_EXTRACTION_PROMPT },
      startTime,
    })
    gen.end({ output: result.overall_description.slice(0, 500), endTime: new Date() })
    await langfuseClient.flushAsync()
  } catch (err) {
    console.warn('[langfuse] analyze_photo_structured trace failed:', err)
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
