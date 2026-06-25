'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCompanyManager } from '@/lib/auth/require-company-role'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendInviteEmail } from '@/lib/email/invite-emails'
import { XtimatorError } from '@/lib/errors'

/**
 * SEAT-03 — the team-invite lifecycle server actions.
 *
 * Authority: BOTH actions gate exclusively through requireCompanyManager
 * (owner|admin) — the single role authority from Phase 135. Role is never
 * trusted from the client.
 *
 * Scope fence: create + email + revoke ONLY. NO accept route (Phase 137), NO
 * member-management UI (Phase 138), NO seat billing (Phase 139). A pending
 * invite does NOT consume a billable seat — nothing billing-related happens here.
 *
 * The raw token is generated server-side, persisted, and delivered ONLY via the
 * invite email. It is NEVER returned to the caller and NEVER logged.
 */

const INVITE_TTL_DAYS = 7

// z.enum(['admin','member']) is what rejects role 'owner'; the company_invites
// role CHECK is the DB-level backstop.
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
})

const TEAM_PATH = '/settings/team'

/**
 * Invite a teammate by email. Owner/admin only.
 *
 * Inserts a pending company_invites row (7-day expiry, unique random token,
 * invited_by = caller) and emails the absolute accept link. Returns success
 * WITHOUT the token. Rejects: non-manager, invalid email, role 'owner',
 * already-active member, and a duplicate pending invite.
 */
export async function inviteMember(
  companyId: string,
  email: string,
  role: 'admin' | 'member'
): Promise<{ success: true } | { error: string }> {
  // 1. Gate — owner|admin only. requireCompanyManager throws on deny.
  let ctx
  try {
    ctx = await requireCompanyManager(companyId)
  } catch (e) {
    return { error: e instanceof XtimatorError ? e.userMessage : 'Not authorized' }
  }

  // 2. Validate (rejects bad email AND role 'owner') before any DB write.
  const parsed = inviteSchema.safeParse({ email, role })
  if (!parsed.success) return { error: 'Invalid email or role' }
  const normEmail = parsed.data.email.trim().toLowerCase()

  const service = requireServiceClient()

  // 4. Already-active-member guard (case-insensitive email match within company).
  const { data: members } = await service
    .from('company_members')
    .select('email')
    .eq('company_id', companyId)
  const alreadyMember = (members ?? []).some(
    (m: { email: string | null }) =>
      typeof m.email === 'string' && m.email.trim().toLowerCase() === normEmail
  )
  if (alreadyMember) {
    return { error: 'This email is already a member of the company.' }
  }

  // 5. Duplicate-pending guard — DOCUMENTED CHOICE: reject, do not replace
  // (keeps the action side-effect-free on conflict).
  const { data: pending } = await service
    .from('company_invites')
    .select('id')
    .eq('company_id', companyId)
    .eq('email', normEmail)
    .eq('status', 'pending')
  if (pending && pending.length > 0) {
    return { error: 'A pending invite already exists for this email.' }
  }

  // 6. Unguessable token. The column UNIQUE constraint is the uniqueness backstop.
  const token = randomBytes(32).toString('base64url')

  // 7. Expiry.
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  // 8. Insert the pending invite.
  const { error: insertError } = await service.from('company_invites').insert({
    company_id: companyId,
    email: normEmail,
    role: parsed.data.role,
    token,
    status: 'pending',
    invited_by: ctx.userId,
    expires_at: expiresAt.toISOString(),
  })
  if (insertError) {
    return { error: 'Failed to create invite.' }
  }

  // 9. Resolve the company name for the email (fall back to a generic label).
  const { data: company } = await service
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle()
  const companyName =
    (company?.name as string | undefined)?.trim() || 'your team'

  // 10. Send the invite email. sendInviteEmail never throws.
  await sendInviteEmail({
    toEmail: normEmail,
    token,
    role: parsed.data.role,
    companyName,
    inviterName: null,
    expiresAt,
  })

  // 11. Revalidate the team settings path.
  revalidatePath(TEAM_PATH)

  // 12. CRITICAL: never include the token in the return.
  return { success: true as const }
}

/**
 * Revoke a pending invite. Owner/admin only, scoped to the invite's company.
 * Flips pending → revoked; no-ops (error) on a non-pending invite.
 */
export async function revokeInvite(
  inviteId: string
): Promise<{ success: true } | { error: string }> {
  const service = requireServiceClient()

  // 1. Look up the invite first (need its company to scope the gate).
  const { data: invite } = await service
    .from('company_invites')
    .select('company_id, status')
    .eq('id', inviteId)
    .maybeSingle()
  if (!invite) return { error: 'Invite not found.' }

  // 2. Gate on the invite's company — authorizes AND scopes to the caller's company.
  try {
    await requireCompanyManager(invite.company_id as string)
  } catch (e) {
    return { error: e instanceof XtimatorError ? e.userMessage : 'Not authorized' }
  }

  // 3. Only pending invites can be revoked (no-op otherwise).
  if (invite.status !== 'pending') {
    return { error: 'Only pending invites can be revoked.' }
  }

  // 4. Flip pending → revoked (the status guard in the WHERE makes it idempotent).
  const { error: updateError } = await service
    .from('company_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('status', 'pending')
  if (updateError) {
    return { error: 'Failed to revoke invite.' }
  }

  // 5. Revalidate.
  revalidatePath(TEAM_PATH)
  return { success: true as const }
}
