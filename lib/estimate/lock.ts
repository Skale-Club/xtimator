// lib/estimate/lock.ts
// TRUST-01 (Phase 164 Plan 01): the ONE shared, pure predicate for "is this
// estimate locked from further in-place edits". Closes audit finding A1 (a
// sent/viewed/signed/accepted estimate remains fully editable — no guard at
// ANY layer: UI only checks is_current, saveEstimate has zero status checks,
// RLS is company-membership only, refine blocks only !is_current).
//
// Plan 02 (freeze guards) imports this in saveEstimate + the refine route —
// kept dependency-free and pure (no DB calls, no side effects) so it can be
// called from server actions, API routes, and tests alike without dragging
// in a Supabase client. Mirrors presentation-settings.ts's degrade-safely
// discipline: null/undefined input never throws.

export interface EstimateLockFields {
  sent_at: string | null
  client_response: string | null
}

/**
 * Locked = delivered: sent to a client OR responded/signed. A signature sets
 * client_response via respondToEstimate (app/api/estimates/[id]/sign/route.ts),
 * so "signed" is covered by the client_response check — no separate signature
 * lookup needed here. A draft (both null) is NOT locked.
 */
export function isEstimateLocked(
  e: EstimateLockFields | null | undefined
): boolean {
  if (e == null) return false
  return e.sent_at != null || e.client_response != null
}
