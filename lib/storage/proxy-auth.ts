import 'server-only'

/**
 * Phase 187 Plan 03 — PROXY-03: tenant ownership gate for the private-bucket
 * side of the same-origin asset proxy (`photos`/`audio`/`pdfs`).
 *
 * `canReadPrivateKey(key)` answers exactly one question: may the CURRENT
 * caller read this tenant-private object? It never touches the DB for an
 * unauthenticated caller, never throws to the route (fail-closed), and never
 * uses the service-role client — every check runs under the RLS-bound client
 * so `company_members`'s own `user_id = auth.uid()` policy is the actual
 * enforcement, not application logic guessing at it.
 *
 * Every private-bucket writer in the app prefixes the company UUID onto the
 * key (see lib/storage/keys.ts's buildStorageKey and Phase 187's CONTEXT.md
 * "Verified production key shapes"), so a key whose first segment is not a
 * UUID is refused outright rather than guessed at — it is either a legacy
 * key this route does not yet understand, or a hostile probe.
 *
 * --- Two deliberate exclusions (Phase 190 must design these, not assume) ---
 *
 * 1. No platform-admin / support-mode bypass. An admin cannot pull another
 *    company's private object through this route in Phase 187. If an admin
 *    surface needs that, it must be added explicitly later — silently
 *    widening what a public URL shape can reach is exactly the leak this
 *    gate exists to prevent.
 *
 * 2. No share-token path, and no server-side-renderer path. Public share
 *    pages and the server-side PDF renderer currently resolve tenant photos
 *    through signed URLs and keep doing so today. Both are unauthenticated
 *    with respect to this route (the PDF renderer has no browser session at
 *    all), so both would be refused here today — which is exactly why
 *    Phase 190 must design their scoping explicitly rather than assume the
 *    proxy already serves them.
 */
import { getAuthClaims } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * Mirrors the UUID shape enforced by lib/storage/keys.ts's COMPANY_ID_RE.
 * Duplicated (not imported) deliberately: keys.ts is out of scope for this
 * plan and must not be modified or given a new export surface just for this
 * one regex. Keep the two patterns identical if either ever changes.
 */
const COMPANY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function canReadPrivateKey(key: string): Promise<boolean> {
  const companyId = key.split('/')[0]
  if (!companyId || !COMPANY_ID_RE.test(companyId)) return false

  const claims = await getAuthClaims()
  const userId = claims?.sub as string | undefined
  if (!userId) return false

  try {
    const supabase = await createClient()
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle()

    return membership !== null && membership !== undefined
  } catch {
    // Fail closed — never let a DB error read as "allowed".
    return false
  }
}
