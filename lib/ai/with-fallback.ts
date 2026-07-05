/**
 * lib/ai/with-fallback.ts
 *
 * Server-only. The single shared OpenRouter→Gemini provider-fallback policy
 * (HARD-03). Every AI call path (generate, refine, transcribe, vision) runs its
 * primary provider through `callWithFallback`; on a thrown error the fallback
 * provider is attempted EXACTLY ONCE. There is no retry loop and no multi-provider
 * cascade — Inngest retries are orthogonal and pre-existing.
 *
 * When BOTH primary and fallback throw, the wrapper throws a MARKED
 * `ProvidersUnavailableError` carrying the original PRIMARY error as `.cause`
 * (the canonical signal). 99-02's generate node maps that marker to the typed
 * failure reason `'provider_unavailable'`. The wrapper NEVER swallows the final
 * failure — it re-throws so the existing never-throw graph nodes convert it to a
 * failure state (ENGINE-04 preserved).
 */

/** Result of a fallback-wrapped AI call. */
export interface FallbackOutcome<T> {
  result: T
  /** Which provider ultimately served the result. */
  servedBy: 'primary' | 'fallback'
  /** True when the primary failed and the fallback produced the result. */
  fallbackFired: boolean
}

/**
 * Marker error thrown by `callWithFallback` when BOTH providers fail.
 *
 * The `providerUnavailable` flag is the deterministic signal the failure model
 * (99-02) keys off of to map this to the typed reason `'provider_unavailable'`.
 * `.cause` carries the original PRIMARY error (not the fallback error).
 * `fallbackCause` (additive, D8) carries the FALLBACK's own error so an
 * operator can see WHY the fallback also failed (e.g. 'Gemini API key not
 * configured') — previously that error was silently discarded.
 *
 * Constructor is flexible to support both call shapes in the test contract:
 *   - `new ProvidersUnavailableError(primaryErr)` — wrapper internal use; the
 *     single argument becomes `.cause`, message defaults to 'All providers unavailable'.
 *   - `new ProvidersUnavailableError(message, cause)` — explicit message + cause.
 */
export class ProvidersUnavailableError extends Error {
  readonly providerUnavailable = true as const
  /** The FALLBACK provider's error (additive — `.cause` stays the PRIMARY error). */
  fallbackCause?: unknown

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
 * Run `primary()`; on any throw run `fallback()` exactly once.
 *   - primary succeeds → { result, servedBy: 'primary', fallbackFired: false } (fallback NOT called).
 *   - primary throws, fallback succeeds → { result, servedBy: 'fallback', fallbackFired: true }.
 *   - both throw → throws a marked `ProvidersUnavailableError` carrying the PRIMARY error as
 *     `.cause` and the fallback's error as `fallbackCause` (D8, observability only).
 *
 * `op` is retained for future logging/observability (GUARD-04, Phase 100) — no
 * behavior depends on it here. Tenant scope lives inside the `primary`/`fallback`
 * closures; this wrapper never accepts a `companyId` field (multi-tenant invariant).
 */
export async function callWithFallback<T>(args: {
  op: string
  primary: () => Promise<T>
  fallback: () => Promise<T>
}): Promise<FallbackOutcome<T>> {
  try {
    const result = await args.primary()
    return { result, servedBy: 'primary', fallbackFired: false }
  } catch (primaryErr) {
    // GUARD-01: a schema-validation failure is NOT a provider-availability failure.
    // Falling back to the other provider would mask the invalid output and break the
    // bounded schema-retry (which must re-call the SAME served provider once). Rethrow
    // the marker so the OUTER `withSchemaRetry` seam handles it.
    if (
      primaryErr instanceof InvalidEstimateOutputError ||
      (primaryErr as { invalidOutput?: unknown } | null)?.invalidOutput === true
    ) {
      throw primaryErr
    }
    try {
      const result = await args.fallback()
      return { result, servedBy: 'fallback', fallbackFired: true }
    } catch (fallbackErr) {
      // Both failed — re-throw the MARKED error carrying the PRIMARY error as
      // cause (NOT the fallback error). The wrapper never swallows the failure.
      // D8: the fallback's error rides along as `fallbackCause` so operators can
      // see why the fallback ALSO failed (previously discarded).
      const err = new ProvidersUnavailableError(primaryErr)
      err.fallbackCause = fallbackErr
      throw err
    }
  }
}
