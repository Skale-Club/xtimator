// lib/estimate/lock.ts
// TRUST-01 (Phase 164 Plan 01): the ONE shared, pure predicate for "is this
// estimate locked from further in-place edits". Closes audit finding A1.
//
// Kept dependency-free and pure (no DB calls, no side effects) so it can be
// called from server actions, API routes, and tests alike without dragging
// in a Supabase client. Degrades safely: null/undefined input never throws.

export interface EstimateLockFields {
  /**
   * Ignored. Sending no longer locks an estimate (lock-at-acceptance); the
   * field is still accepted so callers that pass a full estimate row compile.
   */
  sent_at?: string | null
  client_response: string | null
}

/**
 * Lock-at-acceptance. Locked = the client has ANSWERED (accepted or declined).
 * A signature sets client_response (sign_estimate_atomic), so "signed" is
 * covered here; callers still check estimate_signatures separately for the
 * rare signed-but-unanswered window. A draft OR a merely SENT estimate is NOT
 * locked: the owner may keep correcting it until the client responds.
 *
 * Why this is safe: signing freezes exactly what the client saw. The public
 * sign endpoint requires the content version (updated_at) the page rendered
 * and refuses to sign anything newer, so an edit made after sending can never
 * be signed unseen. Once an answer exists the content is read-only.
 */
export function isEstimateLocked(
  e: EstimateLockFields | null | undefined
): boolean {
  if (e == null) return false
  return e.client_response != null
}
