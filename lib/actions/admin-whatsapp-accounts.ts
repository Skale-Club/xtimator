'use server'

/**
 * Admin-only WhatsApp account provisioning and sender management actions.
 *
 * Every mutation is gated by `requireAdmin()` — only super-admins can
 * provision, activate, suspend, or remove WhatsApp accounts/senders.
 * All writes go through the service-role client (both tables are deny-all RLS).
 *
 * Audit: every successful mutation calls `logAdminAction` with actor, target
 * company/sender, action name, and safe previous/next projections.
 * Audit metadata NEVER contains full phone numbers, tokens, or Meta credentials.
 */
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { isCurrentWhatsAppLinkedIdentity, normalizeWhatsAppPhone } from '@/lib/whatsapp/account-registry'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string }

export type WhatsAppAccountRow = {
  id: string
  company_id: string
  status: string
  delivery_format: string
  review_reason: string | null
  created_at: string
  updated_at: string
}

export type WhatsAppSenderRow = {
  id: string
  company_id: string
  config_id: string
  user_id: string | null
  phone_e164: string
  status: string
  created_by_admin: boolean | null
  admin_phone_only: boolean
  suspension_reason: string | null
  verified_at: string | null
  source_row_id: string | null
  created_at: string
  updated_at: string
}

// ─── Valid status transitions ────────────────────────────────────────────────

const VALID_CONFIG_TRANSITIONS: Record<string, string[]> = {
  pending_review: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['active', 'pending_review'],
}

const VALID_SENDER_TRANSITIONS: Record<string, string[]> = {
  pending_review: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['active'],
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const DeliveryFormatEnum = z.enum(['share_link', 'formatted_text', 'pdf_attachment'])

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Last 4 digits of an E.164 phone for safe audit logging. */
function lastFour(phoneE164: string): string {
  return phoneE164.slice(-4)
}

/** Safe metadata projection — never expose full phone, token, or credential. */
function senderMetadata(row: WhatsAppSenderRow): Record<string, unknown> {
  return {
    senderId: row.id,
    phoneLast4: lastFour(row.phone_e164),
    status: row.status,
    companyId: row.company_id,
    userId: row.user_id,
  }
}

function configMetadata(row: WhatsAppAccountRow): Record<string, unknown> {
  return {
    configId: row.id,
    status: row.status,
    deliveryFormat: row.delivery_format,
    companyId: row.company_id,
  }
}

// ─── saveWhatsAppAccount ─────────────────────────────────────────────────────

/**
 * Create or update a WhatsApp company config.
 *
 * If no config exists for the company, creates one in `pending_review` status.
 * If a config exists, updates status and/or delivery_format with transition validation.
 *
 * Audit: `whatsapp.account.save`
 */
export async function saveWhatsAppAccount(
  companyId: string,
  opts: {
    status?: string
    deliveryFormat?: string
  },
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!companyId) return { ok: false, message: 'companyId is required' }
  const format = DeliveryFormatEnum.optional().safeParse(opts.deliveryFormat)
  if (!format.success) {
    return { ok: false, message: `Invalid delivery format: ${opts.deliveryFormat}` }
  }

  const svc = requireServiceClient()

  // Verify company exists
  const { data: company, error: companyErr } = await svc
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle()

  if (companyErr || !company) {
    return { ok: false, message: 'Company not found' }
  }

  // Read existing config
  const { data: existing, error: configError } = await svc
    .from('whatsapp_company_configs')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()

  if (configError) return { ok: false, message: 'Could not load the WhatsApp account.' }
  const existingRow = existing as WhatsAppAccountRow | null

  if (!existingRow) {
    // Create new config
    const insertData: Record<string, unknown> = {
      company_id: companyId,
      status: 'pending_review',
      delivery_format: format.data ?? 'share_link',
    }

    const { data: newRow, error: insertErr } = await svc
      .from('whatsapp_company_configs')
      .insert(insertData)
      .select()
      .single()

    if (insertErr) {
      console.error('[admin-whatsapp-accounts] saveWhatsAppAccount insert error:', insertErr.message)
      return { ok: false, message: insertErr.message }
    }

    revalidatePath('/admin/inbox/settings')
    void logAdminAction({
      actorId: ctx.userId,
      actorEmail: ctx.email,
      action: 'whatsapp.account.save',
      targetType: 'company',
      targetId: companyId,
      metadata: {
        ...configMetadata(newRow as WhatsAppAccountRow),
        created: true,
      },
    })

    return { ok: true, message: 'WhatsApp account provisioned (pending review).' }
  }

  // Validate status transition
  if (opts.status && opts.status !== existingRow.status) {
    const allowed = VALID_CONFIG_TRANSITIONS[existingRow.status] ?? []
    if (!allowed.includes(opts.status)) {
      return {
        ok: false,
        message: `Cannot transition from '${existingRow.status}' to '${opts.status}'. Allowed: ${allowed.join(', ') || 'none'}`,
      }
    }
  }

  // Update
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (opts.status) patch.status = opts.status
  if (format.data) patch.delivery_format = format.data

  const { data: updated, error: updateErr } = await svc
    .from('whatsapp_company_configs')
    .update(patch)
    .eq('id', existingRow.id)
    .select()
    .single()

  if (updateErr) {
    console.error('[admin-whatsapp-accounts] saveWhatsAppAccount update error:', updateErr.message)
    return { ok: false, message: updateErr.message }
  }

  revalidatePath('/admin/inbox/settings')
  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'whatsapp.account.save',
    targetType: 'company',
    targetId: companyId,
    metadata: {
      ...configMetadata(updated as WhatsAppAccountRow),
      previous: configMetadata(existingRow),
    },
  })

  return { ok: true, message: 'WhatsApp account updated.' }
}

/** Reconcile an expired welcome send only after the admin checks its provider outcome. */
export async function resolveWhatsAppWelcomeStep(
  companyId: string,
  step: number,
  resolution: 'sent' | 'unsent',
): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!z.string().uuid().safeParse(companyId).success || !Number.isInteger(step) || step < 0 || step > 2 ||
    (resolution !== 'sent' && resolution !== 'unsent')) {
    return { ok: false, message: 'Invalid welcome recovery request.' }
  }

  const now = new Date().toISOString()
  const { data, error } = await requireServiceClient().from('whatsapp_company_configs')
    .update({
      welcome_claim_until: null,
      welcome_claim_token: null,
      welcome_sending_step: null,
      ...(resolution === 'sent' ? { welcome_next_step: step + 1 } : {}),
      ...(resolution === 'sent' && step === 2 ? { welcome_sent_at: now } : {}),
    })
    .eq('company_id', companyId)
    .eq('welcome_next_step', step)
    .eq('welcome_sending_step', step)
    .lt('welcome_claim_until', now)
    .select('company_id')
  if (error || !data?.length) return { ok: false, message: 'The welcome step is still in progress or has already been resolved.' }

  void logAdminAction({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: 'whatsapp.welcome.reconcile',
    targetType: 'company',
    targetId: companyId,
    metadata: { step: step + 1, resolution },
  })
  revalidatePath('/admin/inbox/settings')
  return { ok: true, message: 'Welcome delivery reconciled.' }
}

/** Record the verified outcome of a sender's expired first-template attempt. */
export async function resolveWhatsAppWelcomeTemplate(
  senderId: string,
  claimUntil: string,
  resolution: 'sent' | 'unsent',
): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!z.string().uuid().safeParse(senderId).success ||
    !z.string().datetime({ offset: true }).safeParse(claimUntil).success ||
    (resolution !== 'sent' && resolution !== 'unsent')) {
    return { ok: false, message: 'Invalid welcome recovery request.' }
  }

  const now = new Date().toISOString()
  const { data, error } = await requireServiceClient().from('whatsapp_authorized_senders')
    .update({
      welcome_template_claim_until: null,
      welcome_template_needs_review: false,
      ...(resolution === 'sent' ? { welcome_template_sent_at: now } : {}),
    })
    .eq('id', senderId)
    .eq('welcome_template_needs_review', true)
    .eq('welcome_template_claim_until', claimUntil)
    .lt('welcome_template_claim_until', now)
    .is('welcome_template_sent_at', null)
    .select('id')
  if (error || !data?.length) return { ok: false, message: 'The template send is still in progress or has already been resolved.' }

  void logAdminAction({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: 'whatsapp.welcome.reconcile',
    targetType: 'whatsapp_sender',
    targetId: senderId,
    metadata: { kind: 'template', resolution },
  })
  revalidatePath('/admin/inbox/settings')
  return { ok: true, message: 'Welcome template delivery reconciled.' }
}

// ─── saveWhatsAppSender ──────────────────────────────────────────────────────

/**
 * Create or update an authorized WhatsApp sender.
 *
 * Validates E.164 format, rejects duplicates (active number on another company),
 * and links to the company's config. When userId is provided, validates company
 * membership.
 *
 * Audit: `whatsapp.sender.save`
 */
export async function saveWhatsAppSender(
  companyId: string,
  phone: string,
  opts: {
    senderId?: string
    userId?: string
  } = {},
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!companyId) return { ok: false, message: 'companyId is required' }

  const phoneE164 = normalizeWhatsAppPhone(phone)
  if (!phoneE164) {
    return { ok: false, message: 'Invalid phone number. Must be valid E.164 format (e.g. +15551234567).' }
  }

  const svc = requireServiceClient()

  // Verify company exists and has a config
  const { data: config, error: configError } = await svc
    .from('whatsapp_company_configs')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle()

  if (configError) return { ok: false, message: 'Could not load the WhatsApp config.' }
  if (!config) {
    return { ok: false, message: 'Company does not have a WhatsApp config. Provision the account first.' }
  }

  let existingSender: WhatsAppSenderRow | null = null
  if (opts.senderId) {
    const { data: existing, error } = await svc
      .from('whatsapp_authorized_senders')
      .select('*')
      .eq('id', opts.senderId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (error) return { ok: false, message: 'Could not load the sender.' }
    if (!existing) return { ok: false, message: 'Sender not found for this company.' }
    existingSender = existing as WhatsAppSenderRow
  }

  // Editing the phone retains the existing account link unless an admin supplies another account.
  const linkedUserId = opts.userId ?? existingSender?.user_id ?? null
  if (linkedUserId !== null) {
    try {
      if (!await isCurrentWhatsAppLinkedIdentity(companyId, linkedUserId, phoneE164)) {
        return { ok: false, message: 'The phone must be verified on an enabled account that belongs to this company.' }
      }
    } catch {
      return { ok: false, message: 'Could not verify the sender’s account.' }
    }
  }

  const { data: existingActive, error: duplicateError } = await svc
    .from('whatsapp_authorized_senders')
    .select('company_id, id')
    .eq('phone_e164', phoneE164)
    .eq('status', 'active')
    .limit(2)

  if (duplicateError) return { ok: false, message: 'Could not check for an existing sender.' }
  const conflict = existingActive?.find((r: { id: string }) => r.id !== opts.senderId)
  if (conflict) {
    return {
      ok: false,
      message: conflict.company_id === companyId
        ? 'This phone number is already active for this company.'
        : `This phone number is already active for another company (...${lastFour(phoneE164)}).`,
    }
  }

  const now = new Date().toISOString()
  const phoneIdentity = {
    phone_e164: phoneE164,
    user_id: linkedUserId,
    admin_phone_only: linkedUserId === null,
    verified_at: now,
    updated_at: now,
  }

  if (existingSender) {
    const { error: updateErr } = await svc
      .from('whatsapp_authorized_senders')
      .update({
        ...phoneIdentity,
        ...(phoneIdentity.admin_phone_only ? { created_by_admin: true } : {}),
        ...(existingSender.status === 'suspended' ? { suspension_reason: 'admin' } : {}),
      })
      .eq('id', existingSender.id)
      .eq('company_id', companyId)
      .eq('updated_at', existingSender.updated_at)
      .select('id')
      .single()

    if (updateErr) {
      console.error('[admin-whatsapp-accounts] saveWhatsAppSender update error:', updateErr.message)
      return { ok: false, message: updateErr.message }
    }

    revalidatePath('/admin/inbox/settings')
    await logAdminAction({
      actorId: ctx.userId,
      actorEmail: ctx.email,
      action: 'whatsapp.sender.save',
      targetType: 'whatsapp_sender',
      targetId: existingSender.id,
      metadata: {
        companyId,
        phoneLast4: lastFour(phoneE164),
        userId: linkedUserId,
      },
    })

    return { ok: true, message: 'Sender updated.' }
  }

  // Create new sender
  const { data: newSender, error: insertErr } = await svc
    .from('whatsapp_authorized_senders')
    .insert({
      company_id: companyId,
      config_id: config.id,
      ...phoneIdentity,
      status: 'active',
      created_by_admin: true,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[admin-whatsapp-accounts] saveWhatsAppSender insert error:', insertErr.message)
    return { ok: false, message: insertErr.message }
  }

  revalidatePath('/admin/inbox/settings')
  await logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'whatsapp.sender.save',
    targetType: 'whatsapp_sender',
    targetId: (newSender as WhatsAppSenderRow).id,
    metadata: senderMetadata(newSender as WhatsAppSenderRow),
  })

  return { ok: true, message: 'Sender provisioned.' }
}

// ─── setWhatsAppSenderStatus ─────────────────────────────────────────────────

/**
 * Transition a WhatsApp sender to a new status.
 *
 * Only defined transitions are allowed. Activation requires a verified timestamp.
 * Suspension is immediate and reversible.
 *
 * Audit: `whatsapp.sender.status`
 */
export async function setWhatsAppSenderStatus(
  senderId: string,
  newStatus: string,
  options: { confirmPhoneOnly?: boolean } = {},
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!senderId) return { ok: false, message: 'senderId is required' }

  const validStatuses = ['pending_review', 'active', 'suspended']
  if (!validStatuses.includes(newStatus)) {
    return { ok: false, message: `Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}` }
  }

  const svc = requireServiceClient()

  // Read existing sender
  const { data: existing, error: readError } = await svc
    .from('whatsapp_authorized_senders')
    .select('*')
    .eq('id', senderId)
    .maybeSingle()

  if (readError) return { ok: false, message: 'Could not load the sender.' }
  if (!existing) {
    return { ok: false, message: 'Sender not found.' }
  }

  const sender = existing as WhatsAppSenderRow

  // Validate transition
  const allowed = VALID_SENDER_TRANSITIONS[sender.status] ?? []
  if (!allowed.includes(newStatus)) {
    return {
      ok: false,
      message: `Cannot transition from '${sender.status}' to '${newStatus}'. Allowed: ${allowed.join(', ') || 'none'}`,
    }
  }

  let attestPhoneOnly = false
  if (newStatus === 'active') {
    if (sender.user_id === null && !sender.admin_phone_only) {
      if (!sender.created_by_admin || options.confirmPhoneOnly !== true) {
        return { ok: false, message: 'Confirm that this phone may be authorized without a linked account.' }
      }
      attestPhoneOnly = true
    }
    if (sender.user_id) {
      try {
        if (!await isCurrentWhatsAppLinkedIdentity(sender.company_id, sender.user_id, sender.phone_e164)) {
          return { ok: false, message: 'The phone must be verified on an enabled account that belongs to this company.' }
        }
      } catch {
        return { ok: false, message: 'Could not verify the sender’s account.' }
      }
    }
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: newStatus,
    updated_at: now,
    suspension_reason: newStatus === 'suspended' ? 'admin' : null,
  }
  if (newStatus === 'active') patch.verified_at = now
  if (attestPhoneOnly) patch.admin_phone_only = true

  const { error: updateErr } = await svc
    .from('whatsapp_authorized_senders')
    .update(patch)
    .eq('id', senderId)
    .eq('updated_at', sender.updated_at)
    .select('id')
    .single()

  if (updateErr) {
    console.error('[admin-whatsapp-accounts] setWhatsAppSenderStatus error:', updateErr.message)
    return { ok: false, message: updateErr.message }
  }

  revalidatePath('/admin/inbox/settings')
  await logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'whatsapp.sender.status',
    targetType: 'whatsapp_sender',
    targetId: senderId,
    metadata: {
      companyId: sender.company_id,
      phoneLast4: lastFour(sender.phone_e164),
      previousStatus: sender.status,
      newStatus,
      ...(attestPhoneOnly ? { confirmedPhoneOnly: true } : {}),
    },
  })

  return { ok: true, message: `Sender status changed to '${newStatus}'.` }
}

// ─── removeWhatsAppSender ────────────────────────────────────────────────────

/**
 * Soft-remove (suspend) a WhatsApp sender.
 *
 * Performs a reversible suspension rather than erasing conversation history.
 * The sender record and all associated conversations are preserved.
 *
 * Audit: `whatsapp.sender.remove`
 */
export async function removeWhatsAppSender(
  senderId: string,
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!senderId) return { ok: false, message: 'senderId is required' }

  const svc = requireServiceClient()

  // Read existing sender
  const { data: existing, error: readError } = await svc
    .from('whatsapp_authorized_senders')
    .select('*')
    .eq('id', senderId)
    .maybeSingle()

  if (readError) return { ok: false, message: 'Could not load the sender.' }
  if (!existing) {
    return { ok: false, message: 'Sender not found.' }
  }

  const sender = existing as WhatsAppSenderRow

  if (sender.status === 'suspended' && sender.suspension_reason === 'admin') {
    return { ok: false, message: 'Sender is already suspended.' }
  }

  const { error: updateErr } = await svc
    .from('whatsapp_authorized_senders')
    .update({
      status: 'suspended',
      suspension_reason: 'admin',
      updated_at: new Date().toISOString(),
    })
    .eq('id', senderId)
    .eq('updated_at', sender.updated_at)
    .select('id')
    .single()

  if (updateErr) {
    console.error('[admin-whatsapp-accounts] removeWhatsAppSender error:', updateErr.message)
    return { ok: false, message: updateErr.message }
  }

  revalidatePath('/admin/inbox/settings')
  await logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'whatsapp.sender.remove',
    targetType: 'whatsapp_sender',
    targetId: senderId,
    metadata: {
      companyId: sender.company_id,
      phoneLast4: lastFour(sender.phone_e164),
      previousStatus: sender.status,
    },
  })

  return { ok: true, message: 'Sender suspended (removable, conversation history preserved).' }
}
