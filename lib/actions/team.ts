'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCompanyManager } from '@/lib/auth/require-company-role'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendInviteEmail } from '@/lib/email/invite-emails'
import { syncSeatBilling } from '@/lib/billing/seat-billing'
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

// Settable roles via member-management. z.enum(['admin','member']) is what
// rejects 'owner' (and any other value) at the boundary — owner transfer is out
// of scope v1 (SEED-037); the company has exactly one owner.
const roleSchema = z.enum(['admin', 'member'])

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

/**
 * SEAT-05 — member-management server actions.
 *
 * Authority: BOTH actions gate EXCLUSIVELY through requireCompanyManager
 * (owner|admin). The role is read from company_members under the gate — never
 * from an argument. The UI gate (Plan 02) is convenience only; THESE are the
 * security boundary.
 *
 * Guards (locked): (1) last-owner protection — removeMember refuses to delete an
 * 'owner' row; changeMemberRole refuses to target an 'owner' row. (2) settable
 * roles are 'admin' | 'member' only — 'owner' is rejected at the zod boundary.
 *
 * Scope fence: member-management + SEAT-07 seat-sync wiring. After a successful
 * membership mutation (removeMember / changeMemberRole), the never-throw
 * syncSeatBilling(companyId) is invoked as a guarded side-effect so the Stripe
 * seat quantity stays in sync — a billing failure can NEVER fail or roll back the
 * membership op. NO seat-cost number/UI (Phase 140) lives here.
 */

/**
 * Remove a teammate from the company. Owner/admin only.
 *
 * Deletes the target's company_members row scoped by (company_id, user_id).
 * Rejects: non-manager (gate throws), missing target, and an 'owner' target
 * (last-owner guard) — none of which perform a delete.
 */
export async function removeMember(
  companyId: string,
  userId: string
): Promise<{ success: true } | { error: string }> {
  // 1. Gate — owner|admin only. requireCompanyManager throws on deny.
  try {
    await requireCompanyManager(companyId)
  } catch (e) {
    return { error: e instanceof XtimatorError ? e.userMessage : 'Not authorized' }
  }

  const service = requireServiceClient()

  // 2. Look up the target's current role (scoped to this company).
  const { data: target } = await service
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!target) return { error: 'Member not found.' }

  // 3. LAST-OWNER GUARD: the owner row can never be removed via this path.
  if (target.role === 'owner') {
    return { error: 'The company owner cannot be removed.' }
  }

  // 4. Delete the membership row.
  const { error: deleteError } = await service
    .from('company_members')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', userId)
  if (deleteError) {
    return { error: 'Failed to remove member.' }
  }

  revalidatePath(TEAM_PATH)

  // 5. SEAT-07 — the member count dropped; reconcile the Stripe seat quantity.
  //    Guarded so a seat-sync failure can never fail/roll back the removal.
  try {
    await syncSeatBilling(companyId)
  } catch {
    /* seat sync must never fail removal */
  }

  return { success: true as const }
}

/**
 * Change a teammate's role to 'admin' or 'member'. Owner/admin only.
 *
 * Updates the target's company_members.role scoped by (company_id, user_id).
 * Rejects: non-manager (gate throws), a role outside ('admin','member') at the
 * zod boundary (so 'owner' is never settable), missing target, and an 'owner'
 * target (owner role cannot be changed via this path) — none perform an update.
 */
export async function changeMemberRole(
  companyId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<{ success: true } | { error: string }> {
  // 1. Gate — owner|admin only.
  try {
    await requireCompanyManager(companyId)
  } catch (e) {
    return { error: e instanceof XtimatorError ? e.userMessage : 'Not authorized' }
  }

  // 2. Validate the target role — rejects 'owner' (and any non-enum value)
  //    before any DB read/write.
  const parsed = roleSchema.safeParse(role)
  if (!parsed.success) return { error: 'Invalid role.' }

  const service = requireServiceClient()

  // 3. Look up the target's current role.
  const { data: target } = await service
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!target) return { error: 'Member not found.' }

  // 4. OWNER-TARGET GUARD: the owner role cannot be changed via this path.
  if (target.role === 'owner') {
    return { error: 'The company owner role cannot be changed.' }
  }

  // 5. Update the role.
  const { error: updateError } = await service
    .from('company_members')
    .update({ role: parsed.data })
    .eq('company_id', companyId)
    .eq('user_id', userId)
  if (updateError) {
    return { error: 'Failed to update role.' }
  }

  revalidatePath(TEAM_PATH)

  // 6. SEAT-07 — a role flip rarely changes the billable count, but a change that
  //    flips billable status must re-sync; syncSeatBilling is idempotent so the
  //    redundant call is a cheap no-op. Guarded so it can never fail the change.
  try {
    await syncSeatBilling(companyId)
  } catch {
    /* seat sync must never fail role change */
  }

  return { success: true as const }
}
