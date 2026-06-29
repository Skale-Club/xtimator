'use server'

import { randomBytes } from 'node:crypto'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendInviteEmail } from '@/lib/email/invite-emails'
import { logAdminAction } from '@/lib/admin/audit-log'
import { revalidatePath } from 'next/cache'

const INVITE_TTL_DAYS = 7

/**
 * Phase 149 — Demo account handoff.
 *
 * Admin-only. Sends an 'owner' invite to the prospect's email for a demo company.
 * Reuses the existing company_invites table + sendInviteEmail; no new email
 * infrastructure. After the prospect accepts, they become owner; admin stays as admin.
 */
export async function handoffDemoCompany(
  companyId: string,
  email: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await requireAdmin()
  if (!companyId) return { error: 'companyId is required' }

  const normEmail = email.trim().toLowerCase()
  if (!normEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
    return { error: 'A valid email address is required' }
  }

  const svc = requireServiceClient()

  // Guard: already an active member
  const { data: members } = await svc
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

  // Guard: duplicate pending invite
  const { data: pending } = await svc
    .from('company_invites')
    .select('id')
    .eq('company_id', companyId)
    .eq('email', normEmail)
    .eq('status', 'pending')
  if (pending && pending.length > 0) {
    return { error: 'A pending invite already exists for this email.' }
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const { error: insertError } = await svc.from('company_invites').insert({
    company_id: companyId,
    display_name: normEmail,
    email: normEmail,
    role: 'owner',
    token,
    status: 'pending',
    invited_by: ctx.userId,
    expires_at: expiresAt.toISOString(),
  })
  if (insertError) {
    return { error: 'Failed to create invite.' }
  }

  const { data: company } = await svc
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle()
  const companyName = (company?.name as string | undefined)?.trim() || 'your team'

  await sendInviteEmail({
    toEmail: normEmail,
    token,
    role: 'owner',
    companyName,
    inviterName: null,
    expiresAt,
  })

  revalidatePath('/admin/companies')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'company.handoff',
    targetType: 'company',
    targetId: companyId,
    metadata: { prospectEmail: normEmail },
  })

  return { success: true }
}
