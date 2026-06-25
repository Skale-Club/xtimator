'use server'

import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { switchActiveCompany } from '@/lib/actions/active-company'

/**
 * SEAT-04 — acceptInvite(token): the token-authority join action.
 *
 * Authority: this is TOKEN authority via the SERVICE client — NOT
 * requireCompanyRole. The accepting user is not yet a member, so the RLS
 * owner/admin policies on company_invites / company_members do not cover them;
 * the unguessable token IS the authorization. Role and company therefore come
 * ONLY from the invite row — never from a caller-supplied argument.
 *
 * Scope fence: turns ONE pending invite into ONE active company_members row and
 * switches the accepting user into that company. It NEVER creates a company.
 *
 * Single-use is atomic: the status flip (pending → accepted) is guarded
 * `WHERE id=? AND status='pending'` and runs BEFORE the member insert. A 0-row
 * flip means another accept won the race — we reject and write NO membership.
 *
 * The raw token is treated as a secret: it is NEVER logged and NEVER echoed back
 * in any error message.
 */
export async function acceptInvite(
  token: string
): Promise<{ success: true } | { error: string }> {
  // 1. Identify the accepting user (request-scoped client → auth claims).
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims?.sub) {
    return { error: 'You must be signed in to accept this invite.' }
  }

  const service = requireServiceClient()

  // 2. Look up the invite by token (service client — the user is not yet a member).
  //    NOTE: never echo the token in any error; never console.log it.
  const { data: invite } = await service
    .from('company_invites')
    .select('id, company_id, email, role, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!invite) {
    return { error: 'This invite link is invalid.' }
  }

  // 3. Must still be pending (single-use / not revoked).
  if (invite.status !== 'pending') {
    return { error: 'This invite is no longer valid (it may have been used or revoked).' }
  }

  // 4. Must not be expired.
  if (new Date(invite.expires_at as string).getTime() <= Date.now()) {
    return { error: 'This invite has expired.' }
  }

  // 5. The signed-in email must match the invited email (case-insensitive).
  const userEmail = String(claims.email ?? '').trim().toLowerCase()
  const inviteEmail = String(invite.email ?? '').trim().toLowerCase()
  if (!userEmail || userEmail !== inviteEmail) {
    return {
      error:
        'This invite was sent to a different email address. Sign in with the invited email to accept.',
    }
  }

  // 6. SINGLE-USE atomic flip FIRST — guarded WHERE status='pending'. This runs
  //    BEFORE the member insert so a lost race writes no membership. A 0-row
  //    result means another accept already won → reject.
  const { data: flipped } = await service
    .from('company_invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id as string)
    .eq('status', 'pending')
    .select('id')
  if (!flipped || flipped.length === 0) {
    return { error: 'This invite has already been accepted.' }
  }

  // 7. Insert the membership idempotently. Role + company come ONLY from the
  //    invite row — never from a caller param. ignoreDuplicates makes an
  //    already-a-member accept a no-op instead of a crash.
  //    NOTE (v1 tradeoff): the invite is already flipped to 'accepted' above. A
  //    hard (non-conflict) insert error here leaves the invite consumed without a
  //    membership; acceptable for v1 — re-issuing the invite is the recovery path.
  const { error: memberError } = await service.from('company_members').upsert(
    {
      user_id: claims.sub as string,
      company_id: invite.company_id,
      role: invite.role,
      email: invite.email,
    },
    { onConflict: 'user_id,company_id', ignoreDuplicates: true }
  )
  if (memberError) {
    return { error: 'Could not join the team. Please try again.' }
  }

  // 8. Land the user in their new company. The membership now exists, so a
  //    cookie-write hiccup must not fail the join — we ignore its discriminated
  //    error but still call it so the active company is correct.
  await switchActiveCompany(invite.company_id as string)

  return { success: true as const }
}
