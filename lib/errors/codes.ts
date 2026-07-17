/**
 * Typed error system — error codes, surfaces, and message mappings.
 *
 * Composite code: `${ErrorType}:${Surface}` (e.g. "tier_limit:estimates")
 */

export type ErrorType =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'tier_limit'
  | 'offline'
  | 'internal'
  // Phase 164 Plan 02 (TRUST-02) — a delivered (sent/signed/responded)
  // estimate rejected an in-place content write. Distinct from 'conflict'
  // (optimistic-concurrency race) so callers can branch on the code alone.
  | 'estimate_locked'

export type Surface =
  | 'estimates'
  | 'projects'
  | 'clients'
  | 'company'
  | 'auth'
  | 'whatsapp'
  | 'photos'
  | 'recordings'
  | 'translate'
  | 'pdf'
  | 'billing'
  | 'database'
  | 'storage'
  | 'webhook'
  | 'admin'

export const statusByType: Record<ErrorType, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limit: 429,
  tier_limit: 402,
  offline: 503,
  internal: 500,
  estimate_locked: 409,
}

export const defaultMessageByType: Record<ErrorType, string> = {
  bad_request: 'The request is invalid.',
  unauthorized: 'Please sign in to continue.',
  forbidden: "You don't have access to this resource.",
  not_found: 'The requested resource was not found.',
  conflict: 'The resource is in a conflicting state.',
  rate_limit: 'Too many requests. Please slow down and try again shortly.',
  tier_limit: 'You reached your plan limit. Upgrade to continue.',
  offline: 'The service is temporarily unavailable. Please try again.',
  internal: 'Something went wrong on our side. Please try again.',
  estimate_locked:
    'Estimate has been delivered and is locked; create a new version to make changes.',
}

/**
 * Per-code overrides. Falls back to defaultMessageByType[type] when no override exists.
 * Use specific, actionable copy here.
 */
export const userMessageByCode: Partial<Record<string, string>> = {
  // Tier limits
  'tier_limit:estimates':
    'You reached your monthly estimate limit. Upgrade your plan to continue creating estimates.',
  'tier_limit:photos':
    'You reached your photo analysis limit. Upgrade your plan to analyze more photos.',
  'tier_limit:whatsapp':
    'Your plan does not include the WhatsApp channel. Upgrade to send estimates via WhatsApp.',

  // Rate limits
  'rate_limit:whatsapp':
    'You sent too many messages. Try again in a few minutes.',
  'rate_limit:estimates':
    'Too many estimates in a short window. Please wait a moment.',
  'rate_limit:photos':
    'Too many photo uploads. Please wait a moment.',
  'rate_limit:translate':
    'Too many translation requests. Please wait a moment.',

  // Bad requests
  'bad_request:photos':
    'One or more photos could not be processed. Please try uploading them again.',
  'bad_request:recordings':
    'The audio could not be processed. Please try recording again.',
  'bad_request:whatsapp':
    "We couldn't understand that. Please review the available commands and try again.",

  // Auth
  'unauthorized:auth': 'Please sign in to continue.',
  'forbidden:admin': 'Admin access required.',

  // Not found
  'not_found:estimates': 'Estimate not found.',
  'not_found:projects': 'Project not found.',
  'not_found:clients': 'Client not found.',

  // Conflict
  'conflict:whatsapp':
    'This WhatsApp number is already connected to another account.',
}

/**
 * Compose a code from type + surface.
 */
export function makeCode(type: ErrorType, surface: Surface): string {
  return `${type}:${surface}`
}
