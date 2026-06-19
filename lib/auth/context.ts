import 'server-only'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'

/**
 * Shared auth context for server actions.
 *
 * Resolves the signed-in user id and their active company id using the
 * established request-scoped helpers (`getAuthClaims` for the validated JWT,
 * `getActiveCompanyId` for the multi-tenant active-company cookie). Returns a
 * discriminated result so callers can early-return `{ error }` exactly like the
 * inline `getAuthContext` helpers already scattered across `lib/actions/*`.
 *
 * Success → `{ userId, companyId }`. Failure → `{ error }`.
 */
export type AuthContext =
  | { userId: string; companyId: string }
  | { error: string }

export async function getAuthContext(): Promise<AuthContext> {
  const claims = await getAuthClaims()
  const userId = (claims?.sub as string | undefined) ?? null
  if (!userId) return { error: 'Not authenticated' }

  const companyId = await getActiveCompanyId()
  if (!companyId) return { error: 'No company found' }

  return { userId, companyId }
}
