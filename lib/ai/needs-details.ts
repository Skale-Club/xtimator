/**
 * lib/ai/needs-details.ts
 *
 * QUICK-psh-01 — classify WHY a vague/discarded generation could not be
 * priced, and (for real-but-thin input) produce 2-4 concrete clarifying
 * questions in the estimate's language. Wired at the SINGLE final-vague
 * terminal (the default web/MCP adapter's `finalize`, after auto-refine's one
 * retry is exhausted — see lib/estimate/adapters/default.ts). Production case
 * (attempt 8a0c13e8): a mic-test recording produced a generic discard; this
 * call turns that into "that sounded like a mic test" or, for real-but-thin
 * input, the specific questions that would make it priceable.
 *
 * Mirrors the small-call pattern of translateTextsOR (lib/ai/openrouter-client.ts):
 * a single direct OpenRouter chat/completions call — this is best-effort
 * classification copy, not the estimate itself, so it does not go through the
 * callWithFallback cascade.
 *
 * Never-throw: ANY failure (missing key, network, malformed JSON) degrades to
 * `{ reason: 'missing_specifics', questions: [] }` so the vague/awaiting_details
 * flow itself can never break because of this enrichment call.
 */
import {
  getORKey,
  OR_DEFAULTS,
  OPENROUTER_BASE,
  AI_CHAT_TIMEOUT_MS,
} from '@/lib/ai/openrouter-client'

export type NeedsDetailsReason = 'mic_test' | 'too_short' | 'missing_specifics'

export interface NeedsDetailsResult {
  reason: NeedsDetailsReason
  questions: string[]
}

const SAFE_FALLBACK: NeedsDetailsResult = { reason: 'missing_specifics', questions: [] }

const LANGUAGE_LABEL: Record<'en' | 'pt' | 'es', string> = {
  en: 'English',
  pt: 'Brazilian Portuguese (PT-BR)',
  es: 'Latin American Spanish (ES)',
}

/**
 * Classify why a field-service estimate input was too vague to price, and (for
 * real-but-thin input) generate 2-4 concrete clarifying questions in the
 * ESTIMATE language — phrased for a field-service business owner so they know
 * exactly what to say on the next recording.
 *
 * reason:
 *   - 'mic_test'          — the input reads like an accidental/test recording
 *                           (silence, "testing 1 2 3", a stray greeting with no
 *                           job content). questions ALWAYS []  — the UI copy
 *                           alone carries the "that sounded like a mic test"
 *                           message.
 *   - 'too_short'         — real job content, but too brief to price at all.
 *   - 'missing_specifics' — a real job description missing the specifics
 *                           needed to price it (quantities, materials,
 *                           dimensions, condition...).
 *
 * Never throws: any failure (missing key, network, malformed JSON) returns the
 * safe fallback `{ reason: 'missing_specifics', questions: [] }`.
 */
export async function buildNeedsDetails(
  transcriptOrDescription: string,
  language: 'en' | 'pt' | 'es',
  industryHint?: string | null
): Promise<NeedsDetailsResult> {
  try {
    const apiKey = await getORKey()
    const langLabel = LANGUAGE_LABEL[language] ?? LANGUAGE_LABEL.en
    const trade = industryHint?.trim() || 'field service'
    const input = transcriptOrDescription.trim().slice(0, 4000)

    const prompt =
      `A ${trade} business owner recorded or typed the following job description, but ` +
      `the AI could not produce a priceable estimate from it:\n\n"""\n${input}\n"""\n\n` +
      `Classify WHY this input could not be priced, and — unless it is a mic test — write ` +
      `2-4 concrete, specific clarifying questions in ${langLabel} that would let the owner ` +
      `make it priceable on their next recording (ask about quantities, materials, ` +
      `dimensions, condition, or scope as relevant to the job described).\n\n` +
      `Return ONLY a raw JSON object (no markdown, no code blocks) of the shape:\n` +
      `{"reason": "mic_test" | "too_short" | "missing_specifics", "questions": string[]}\n\n` +
      `- "mic_test": the input is clearly an accidental/test recording (silence, ` +
      `"testing 1 2 3", a stray greeting, no job content at all) — questions MUST be [].\n` +
      `- "too_short": there IS real job content but it is too brief to price — 2-4 questions.\n` +
      `- "missing_specifics": a real job description missing the specifics needed to price ` +
      `it — 2-4 questions.\n` +
      `Questions must be phrased for the field-service owner, written in ${langLabel}, and ` +
      `specific to what they described (never generic).`

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OR_DEFAULTS.translation,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
      // AIREL-01: this call is best-effort/never-throw (see the outer try/catch
      // below) — an abort degrades to SAFE_FALLBACK exactly like any other
      // network failure, it never throws out of buildNeedsDetails.
      signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
    })

    if (!res.ok) return { ...SAFE_FALLBACK }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
      error?: { message?: string }
    }
    if (json.error?.message) return { ...SAFE_FALLBACK }

    const raw = json.choices?.[0]?.message?.content ?? ''
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(clean) as { reason?: unknown; questions?: unknown }

    const reason: NeedsDetailsReason =
      parsed.reason === 'mic_test' ||
      parsed.reason === 'too_short' ||
      parsed.reason === 'missing_specifics'
        ? parsed.reason
        : 'missing_specifics'

    const questions =
      reason === 'mic_test'
        ? []
        : Array.isArray(parsed.questions)
          ? parsed.questions
              .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
              .map((q) => q.trim())
              .slice(0, 4)
          : []

    return { reason, questions }
  } catch (err) {
    console.warn('[needs-details] buildNeedsDetails swallowed failure, using safe fallback:', err)
    return { ...SAFE_FALLBACK }
  }
}
