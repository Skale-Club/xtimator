/**
 * lib/observability/langfuse-mask.ts — Pre-launch audit fix (IA/low, 2026-07-06):
 * "Prompts completos (transcripts, PII) vão para o Langfuse input — conflita com
 * a postura 'safe-metadata' declarada; mascarar/documentar."
 *
 * Masking policy for Langfuse trace payloads. Wired centrally as the `mask`
 * option of the LangfuseSpanProcessor in instrumentation.ts, so EVERY exported
 * span is covered — the @langfuse/langchain CallbackHandler traces (web + WhatsApp
 * estimate graph) and the langfuseClient shim traces (Whisper, vision, translation,
 * price research) all flow through the same processor.
 *
 * The processor applies `mask` ONLY to the input / output / metadata span
 * attributes. Model name, token usage, session id, user id, tags, timings and
 * span names are separate attributes and are never passed to the mask — they
 * survive untouched by construction.
 *
 * Policy (structure-preserving):
 *  - numbers, booleans, null      → kept (token counts, flags, prices)
 *  - objects / arrays             → walked recursively, keys kept
 *  - strings under content-bearing keys (content, text, transcript, prompt, …)
 *                                 → "[redacted N chars]"
 *  - strings matching email/phone → "[redacted email]" / "[redacted phone]"
 *  - single-token strings ≤ 64 chars (ids, UUIDs, enums, model slugs, ISO dates)
 *                                 → kept
 *  - everything else (free text, base64, long tokens)
 *                                 → "[redacted N chars]"
 *
 * MUST stay a pure module (no 'server-only', no env access) so unit tests can
 * import it directly.
 */

/**
 * Keys whose string values are always redacted regardless of shape — these are
 * the fields that carry customer free text / PII in our trace payloads.
 */
const REDACT_KEYS = new Set([
  'content',
  'text',
  'transcript',
  'transcription',
  'prompt',
  'prompts',
  'completion',
  'message',
  'question',
  'answer',
  'instructions',
  'system',
  'description',
  'note',
  'notes',
  'body',
  'html',
  'markdown',
  'summary',
  'title',
  'name',
  'first_name',
  'firstname',
  'last_name',
  'lastname',
  'full_name',
  'fullname',
  'email',
  'phone',
  'address',
])

/** Longest string kept verbatim by the single-token rule. UUIDs (36) and model slugs fit. */
const MAX_SAFE_TOKEN_LENGTH = 64

/** Single token: no whitespace, bounded length — ids, enums, slugs, ISO dates. */
const SAFE_TOKEN_RE = /^\S{1,64}$/

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Phone-like: optional +, then 7–15 digits allowing separators ( ) - . and spaces. */
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/

function hasEnoughDigitsForPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

function redactedText(value: string): string {
  return `[redacted ${value.length} chars]`
}

function maskString(value: string, key?: string): string {
  if (value.length === 0) return value
  const lowerKey = key?.toLowerCase()
  if (lowerKey !== undefined && REDACT_KEYS.has(lowerKey)) return redactedText(value)
  if (EMAIL_RE.test(value)) return '[redacted email]'
  if (PHONE_RE.test(value) && hasEnoughDigitsForPhone(value)) return '[redacted phone]'
  if (value.length <= MAX_SAFE_TOKEN_LENGTH && SAFE_TOKEN_RE.test(value)) return value
  return redactedText(value)
}

function maskValue(value: unknown, key: string | undefined, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'number' || t === 'boolean') return value
  if (t === 'string') return maskString(value as string, key)
  if (t === 'object') {
    const obj = value as object
    if (seen.has(obj)) return '[circular]'
    seen.add(obj)
    if (Array.isArray(obj)) {
      return obj.map((item) => maskValue(item, key, seen))
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k] = maskValue(v, k, seen)
    }
    return out
  }
  // bigint / function / symbol — never expected in span payloads.
  return `[redacted ${t}]`
}

function tryParseJson(value: string): unknown | undefined {
  const trimmed = value.trim()
  // Only attempt structured parse for object/array payloads — bare strings and
  // numbers go through the plain string policy instead.
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

/**
 * Mask a Langfuse span payload before export. Signature matches the
 * `MaskFunction` of @langfuse/otel@5.5.3: ({ data }) => maskedData.
 *
 * Span attributes arrive JSON-serialized (OTel attributes are primitives), so a
 * string payload that parses as an object/array is masked structurally and
 * re-serialized; anything else falls back to the plain-string policy.
 */
export function maskLangfuseData({ data }: { data: unknown }): unknown {
  if (typeof data === 'string') {
    const parsed = tryParseJson(data)
    if (parsed !== undefined && typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(maskValue(parsed, undefined, new WeakSet()))
    }
    return maskString(data, undefined)
  }
  return maskValue(data, undefined, new WeakSet())
}
