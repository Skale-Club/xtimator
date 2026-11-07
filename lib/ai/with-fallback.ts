/**
 * lib/ai/with-fallback.ts
 *
 * Server-only. The shared AI-call failure policy. EVERY AI call in Xtimator goes
 * through OpenRouter and ONLY OpenRouter (owner rule): there is no secondary
 * provider (no direct Gemini, OpenAI or Anthropic). `callWithFallback` is kept as
 * the single seam so callers and the UI keep the same error shapes: when the
 * (OpenRouter) primary throws, the wrapper throws a MARKED
 * `ProvidersUnavailableError` carrying the original error as `.cause`. The
 * generate/refine nodes map that marker to the typed failure reason
 * `'provider_unavailable'`. The wrapper NEVER swallows the failure and never
 * retries on another provider.
 */

import { notifyOps } from '@/lib/observability/ops-alert'

/** Result of a wrapped AI call. */
export interface FallbackOutcome<T> {
  result: T
  /** Always the OpenRouter primary: there is no secondary provider. */
  servedBy: 'primary'
}

/**
 * Marker error thrown by `callWithFallback` when BOTH providers fail.
 *
 * The `providerUnavailable` flag is the deterministic signal the failure model
 * (99-02) keys off of to map this to the typed reason `'provider_unavailable'`.
 * `.cause` carries the original (OpenRouter) error.
 *
 * Constructor is flexible to support both call shapes in the test contract:
 *   - `new ProvidersUnavailableError(primaryErr)` — wrapper internal use; the
 *     single argument becomes `.cause`, message defaults to 'All providers unavailable'.
 *   - `new ProvidersUnavailableError(message, cause)` — explicit message + cause.
 */
export class ProvidersUnavailableError extends Error {
  readonly providerUnavailable = true as const
  constructor(causeOrMessage?: unknown, maybeCause?: unknown) {
    const hasExplicitMessage = arguments.length >= 2
    super(hasExplicitMessage ? String(causeOrMessage) : 'All providers unavailable')
    this.name = 'ProvidersUnavailableError'
    this.cause = hasExplicitMessage ? maybeCause : causeOrMessage
  }
}

/**
 * GUARD-01 marker error thrown by the provider adapters when an AI estimate output
 * fails `estimateOutputSchema` validation (`normalizeOutput` returns `{ ok: false }`).
 *
 * The `invalidOutput` brand is the deterministic signal the schema-retry seam
 * (`provider-with-fallback.ts`) and the generate node (100-01) key off of —
 * surviving module-instance boundaries exactly like `ProvidersUnavailableError`'s
 * `providerUnavailable` brand. The generate node maps it to the already-declared
 * typed reason `'invalid_output'`. It is ORTHOGONAL to `ProvidersUnavailableError`:
 * a provider-down failure is NOT an InvalidEstimateOutputError, so the schema-retry
 * rethrows it immediately (no retry storm).
 */
export class InvalidEstimateOutputError extends Error {
  readonly invalidOutput = true as const
  constructor(readonly zodError: import('zod').ZodError) {
    super('Estimate output failed schema validation after one retry')
    this.name = 'InvalidEstimateOutputError'
  }
}

/**
 * AIREL-02 marker error thrown by the OpenRouter adapter when the model's
 * response reports `finish_reason === 'length'` (the generation was cut off by
 * the max_tokens budget). Previously this was invisible: a truncated tool-call
 * either failed JSON.parse and surfaced as the generic "OpenRouter returned
 * malformed tool-call arguments" (masking the real cause), or — worse — landed
 * on a byte-for-byte VALID-but-incomplete JSON object and persisted as a
 * silent partial estimate.
 *
 * Unlike `InvalidEstimateOutputError`, this is NOT a schema-validation failure;
 * it surfaces as `ProvidersUnavailableError` (diagnosable via `.cause`).
 */
export class TruncatedOutputError extends Error {
  readonly truncated = true as const
  constructor(op: string) {
    super(`AI output truncated (finish_reason=length) during ${op}`)
    this.name = 'TruncatedOutputError'
  }
}

/**
 * Run the OpenRouter `primary()`.
 *   - succeeds -> { result, servedBy: 'primary' }.
 *   - throws `InvalidEstimateOutputError` -> rethrown UNCHANGED so the outer
 *     schema-retry seam can re-call once (GUARD-01).
 *   - throws anything else -> a marked `ProvidersUnavailableError` carrying the
 *     original error as `.cause`. No other provider is ever attempted.
 *
 * `op` is retained for logging/observability only. Tenant scope lives inside the
 * `primary` closure; this wrapper never accepts a `companyId` field.
 */
export async function callWithFallback<T>(args: {
  op: string
  primary: () => Promise<T>
}): Promise<FallbackOutcome<T>> {
  try {
    const result = await args.primary()
    return { result, servedBy: 'primary' }
  } catch (primaryErr) {
    // GUARD-01: a schema-validation failure is NOT a provider-availability failure;
    // rethrow the marker so the OUTER `withSchemaRetry` seam handles it.
    if (
      primaryErr instanceof InvalidEstimateOutputError ||
      (primaryErr as { invalidOutput?: unknown } | null)?.invalidOutput === true
    ) {
      throw primaryErr
    }
    reportProviderFailure(args.op, primaryErr)
    throw new ProvidersUnavailableError(primaryErr)
  }
}

/**
 * Never-throw ops alert for a failed OpenRouter call. OpenRouter is the ONLY
 * provider, so a failure here means the customer's operation fails (there is no
 * silent fallback serving it any more) and an operator must know. Escalates to
 * 'error' when the error string indicates an ACCOUNT-level failure (402 /
 * insufficient credits / 401 / bad-or-missing key); the billing escalation gets
 * its own dedupeKey suffix so an outage and a transient blip suppress
 * independently. Fire-and-forget: `notifyOps` is never-throw and not awaited;
 * the body is additionally try/catch-swallowed. Company-agnostic: op + error
 * only, NEVER a companyId.
 */
function reportProviderFailure(op: string, primaryErr: unknown): void {
  try {
    const primaryError =
      primaryErr instanceof Error
        ? `${primaryErr.name}: ${primaryErr.message}`
        : String(primaryErr)
    const billingOrAuth =
      /402|insufficient credits|401|user not found|not configured/i.test(primaryError)
    void notifyOps({
      kind: 'ai_provider_failed',
      title: `OpenRouter call failed for '${op}'`,
      message: primaryError,
      severity: billingOrAuth ? 'error' : 'warning',
      dedupeKey: `ai_provider_failed:${op}${billingOrAuth ? ':billing' : ''}`,
      suppressWindowSec: 900,
    })
  } catch {
    // notifyOps is itself never-throw; this guard is belt-and-suspenders.
  }
}
