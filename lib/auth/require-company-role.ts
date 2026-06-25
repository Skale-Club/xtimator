import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { XtimatorError } from '@/lib/errors'

/**
 * SEAT-02 — the SINGLE server-side role-authority gate for team seats.
 * Role is resolved from company_members on the RLS-bound client; never trusted
 * from the client. owner+admin manage members/invites; owner-only for
 * billing/seat/ownership.
 *
 * Locked role matrix (NON-NEGOTIABLE):
 *   owner            → manage members/invites: YES ; billing/seat/ownership: YES
 *   admin            → manage members/invites: YES ; billing/seat/ownership: NO
 *   member           → manage members/invites: NO  ; billing/seat/ownership: NO
 *   non-member/none  → everything: NO
 *
 * This is the ONE place role gating lives. Phases 136-140 call it; they never
 * re-derive a role or trust a role from the request body.
 */

export type CompanyRole = 'owner' | 'admin' | 'member'

export type CompanyRoleContext = {
  userId: string
  companyId: string
  role: CompanyRole
}

/**
 * Resolve the caller's company_members role for `companyId` from the RLS-bound
 * server client (the caller's own JWT — NOT the service role) and assert it is
 * one of `allowedRoles`.
 *
 * - Unauthenticated (no auth claims) → throws XtimatorError('unauthorized').
 * - Non-member (no company_members row) or role ∉ allowedRoles → throws
 *   XtimatorError('forbidden').
 * - Otherwise resolves with the verified { userId, companyId, role }.
 *
 * The role is read ONLY from company_members under the caller's identity; it is
 * never accepted as an argument.
 */
export async function requireCompanyRole(
  companyId: string,
  allowedRoles: CompanyRole[]
): Promise<CompanyRoleContext> {
  const supabase = await createClient()

  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub as string | undefined
  if (!userId) {
    throw new XtimatorError('unauthorized', 'company', 'Not authenticated')
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()

  const role = membership?.role as CompanyRole | undefined
  if (!role || !allowedRoles.includes(role)) {
    throw new XtimatorError('forbidden', 'company', 'Insufficient company role')
  }

  return { userId, companyId, role }
}

/** Owner+admin gate — manage members/invites. Delegates to requireCompanyRole. */
export async function requireCompanyManager(
  companyId: string
): Promise<CompanyRoleContext> {
  return requireCompanyRole(companyId, ['owner', 'admin'])
}

/** Owner-only gate — billing/seat/ownership. Delegates to requireCompanyRole. */
export async function requireCompanyOwner(
  companyId: string
): Promise<CompanyRoleContext> {
  return requireCompanyRole(companyId, ['owner'])
}
