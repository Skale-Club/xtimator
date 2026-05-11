/**
 * Typed error system — public API.
 *
 * Usage:
 *   throw new XtimatorError('tier_limit', 'estimates', 'Monthly quota exceeded',
 *     undefined, { used: 10, limit: 10 })
 *
 *   try { ... } catch (err) { return asResponse(err) }
 */
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import {
  type ErrorType,
  type Surface,
  statusByType,
  defaultMessageByType,
  userMessageByCode,
  makeCode,
} from './codes'

export { ErrorType, Surface }

/**
 * Structured error with type, surface, and metadata.
 *
 * - `type` controls HTTP status and broad semantics
 * - `surface` is the functional area (estimates, whatsapp, etc.) and drives user message lookup
 * - `cause` preserves the original error for logging
 * - `meta` is attached to the JSON response (e.g. quota usage, upgrade URL)
 */
export class XtimatorError extends Error {
  readonly type: ErrorType
  readonly surface: Surface
  readonly cause?: unknown
  readonly meta?: Record<string, unknown>

  constructor(
    type: ErrorType,
    surface: Surface,
    message: string,
    cause?: unknown,
    meta?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'XtimatorError'
    this.type = type
    this.surface = surface
    this.cause = cause
    this.meta = meta
  }

  get code(): string {
    return makeCode(this.type, this.surface)
  }

  get statusCode(): number {
    return statusByType[this.type]
  }

  get userMessage(): string {
    return userMessageByCode[this.code] ?? defaultMessageByType[this.type]
  }

  /** Internal errors hide their message from users (full detail logged server-side). */
  get logOnly(): boolean {
    return this.type === 'internal'
  }
}

/**
 * Convert any thrown value to a NextResponse with appropriate status + JSON body.
 *
 * Handles:
 *   - XtimatorError → typed response with user message
 *   - ZodError → 400 with field-level issues
 *   - Other Error → 500 generic (logs full detail server-side)
 */
export function asResponse(err: unknown): NextResponse {
  if (err instanceof XtimatorError) {
    // Always log structured errors for observability
    console.error(`[${err.code}]`, err.message, err.meta ?? '', err.cause ?? '')

    const body = err.logOnly
      ? { error: defaultMessageByType.internal, code: err.code }
      : {
          error: err.userMessage,
          code: err.code,
          ...(err.meta ? { meta: err.meta } : {}),
        }

    return NextResponse.json(body, { status: err.statusCode })
  }

  if (err instanceof ZodError) {
    const fields = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    console.warn('[bad_request:validation]', fields)
    return NextResponse.json(
      { error: 'Invalid input.', code: 'bad_request:validation', meta: { fields } },
      { status: 400 }
    )
  }

  // Unknown error — log full detail, return generic
  console.error('[internal:unknown]', err)
  return NextResponse.json(
    { error: defaultMessageByType.internal, code: 'internal:unknown' },
    { status: 500 }
  )
}

// ----- Convenience throw helpers -----

/** Assert value is non-null; throws not_found XtimatorError otherwise. */
export function throwIfNotFound<T>(
  value: T | null | undefined,
  surface: Surface,
  message = 'Not found'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new XtimatorError('not_found', surface, message)
  }
}

/** Assert condition is true; throws forbidden otherwise. */
export function throwIfForbidden(
  condition: boolean,
  surface: Surface,
  message = 'Forbidden'
): asserts condition {
  if (!condition) {
    throw new XtimatorError('forbidden', surface, message)
  }
}

/** Assert condition is true; throws bad_request otherwise. */
export function throwIfBadRequest(
  condition: boolean,
  surface: Surface,
  message = 'Bad request'
): asserts condition {
  if (!condition) {
    throw new XtimatorError('bad_request', surface, message)
  }
}

/** Shorthand for wrapping unknown errors as internal. */
export function asInternal(
  surface: Surface,
  cause: unknown,
  message = 'Internal error'
): XtimatorError {
  return new XtimatorError('internal', surface, message, cause)
}
