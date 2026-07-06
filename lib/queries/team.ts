import { requireCompanyManager } from '@/lib/auth/require-company-role'
import { requireServiceClient } from '@/lib/supabase/service'
import { XtimatorError } from '@/lib/errors'

/**
 * SEAT-05 — the team roster read model.
 *
 * listCompanyRoster lists a company's ACTIVE members (from company_members,
 * which carries display_name/email/role directly — no auth.users join) plus its
 * PENDING invites (company_invites where status='pending'). It is the read half
 * that the member-management UI (Plan 02) consumes.
 *
 * Authority: manager-gated (owner|admin) via requireCompanyManager. A non-manager
 * gets { error } and NO roster rows are read or leaked.
 *
 * Scope fence: read-only roster ONLY. NO seat counts/billing (Phase 139/140).
 */

export type RosterMember = {
  user_id: string
  display_name: string | null
  email: string | null
  role: 'owner' | 'admin' | 'member'
}

export type RosterInvite = {
  id: string
  display_name: string | null
  email: string
  role: 'admin' | 'member'
}

/**
 * Return the active members + pending invites for `companyId`. Owner/admin only.
 *
 * Members are listed from company_members (created_at asc); invites are only the
 * status='pending' rows. Returns { error } if the caller is not a manager —
 * before any roster read.
 */
export async function listCompanyRoster(
  companyId: string
): Promise<{ members: RosterMember[]; invites: RosterInvite[] } | { error: string }> {
  // 1. Gate — owner|admin only. requireCompanyManager throws on deny (before any read).
  try {
    await requireCompanyManager(companyId)
  } catch (e) {
    return { error: e instanceof XtimatorError ? e.userMessage : 'Not authorized' }
  }

  const service = requireServiceClient()

  // 2. Active members — company_members carries display_name/email/role directly.
  const { data: members } = await service
    .from('company_members')
    .select('user_id, display_name, email, role')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  // 3. Pending invites only.
  const { data: invites } = await service
    .from('company_invites')
    .select('id, display_name, email, role')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  return {
    members: (members ?? []) as RosterMember[],
    invites: (invites ?? []) as RosterInvite[],
  }
}
