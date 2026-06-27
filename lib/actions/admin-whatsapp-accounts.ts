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
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/account-registry'

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
  pending: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['active'],
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const DeliveryFormatEnum = z.enum(['text', 'interactive', 'template'])

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
  const { data: existing } = await svc
    .from('whatsapp_company_configs')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()

  const existingRow = existing as WhatsAppAccountRow | null

  if (!existingRow) {
    // Create new config
    const insertData: Record<string, unknown> = {
      company_id: companyId,
      status: 'pending_review',
      delivery_format: opts.deliveryFormat ?? 'interactive',
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

    revalidatePath('/admin/whatsapp')
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

  // Validate delivery format
  if (opts.deliveryFormat) {
    const parsed = DeliveryFormatEnum.safeParse(opts.deliveryFormat)
    if (!parsed.success) {
      return { ok: false, message: `Invalid delivery format: ${opts.deliveryFormat}` }
    }
  }

  // Update
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (opts.status) patch.status = opts.status
  if (opts.deliveryFormat) patch.delivery_format = opts.deliveryFormat

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

  revalidatePath('/admin/whatsapp')
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
  const { data: config } = await svc
    .from('whatsapp_company_configs')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!config) {
    return { ok: false, message: 'Company does not have a WhatsApp config. Provision the account first.' }
  }

  // Verify company membership when userId is provided
  if (opts.userId) {
    const { data: membership } = await svc
      .from('company_members')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('user_id', opts.userId)
      .maybeSingle()

    if (!membership) {
      return { ok: false, message: 'User is not a member of this company.' }
    }
  }

  // Check for duplicate active phone on ANOTHER company
  const { data: existingActive } = await svc
    .from('whatsapp_authorized_senders')
    .select('company_id, id')
    .eq('phone_e164', phoneE164)
    .eq('status', 'active')
    .limit(2)

  if (existingActive && existingActive.length > 0) {
    const conflict = existingActive.find(
      (r: { company_id: string; id: string }) =>
        r.company_id !== companyId && (!opts.senderId || r.id !== opts.senderId),
    )
    if (conflict) {
      return {
        ok: false,
        message: `This phone number is already active for another company (...${lastFour(phoneE164)}).`,
      }
    }
  }

  if (opts.senderId) {
    // Update existing sender
    const { data: existing } = await svc
      .from('whatsapp_authorized_senders')
      .select('*')
      .eq('id', opts.senderId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (!existing) {
      return { ok: false, message: 'Sender not found for this company.' }
    }

    const { error: updateErr } = await svc
      .from('whatsapp_authorized_senders')
      .update({
        phone_e164: phoneE164,
        user_id: opts.userId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.senderId)

    if (updateErr) {
      console.error('[admin-whatsapp-accounts] saveWhatsAppSender update error:', updateErr.message)
      return { ok: false, message: updateErr.message }
    }

    revalidatePath('/admin/whatsapp')
    void logAdminAction({
      actorId: ctx.userId,
      actorEmail: ctx.email,
      action: 'whatsapp.sender.save',
      targetType: 'whatsapp_sender',
      targetId: opts.senderId,
      metadata: {
        companyId,
        phoneLast4: lastFour(phoneE164),
        userId: opts.userId ?? null,
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
      phone_e164: phoneE164,
      user_id: opts.userId ?? null,
      status: 'pending',
      created_by_admin: true,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[admin-whatsapp-accounts] saveWhatsAppSender insert error:', insertErr.message)
    return { ok: false, message: insertErr.message }
  }

  revalidatePath('/admin/whatsapp')
  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'whatsapp.sender.save',
    targetType: 'whatsapp_sender',
    targetId: (newSender as WhatsAppSenderRow).id,
    metadata: senderMetadata(newSender as WhatsAppSenderRow),
  })

  return { ok: true, message: 'Sender provisioned (pending activation).' }
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
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!senderId) return { ok: false, message: 'senderId is required' }

  const validStatuses = ['pending', 'active', 'suspended']
  if (!validStatuses.includes(newStatus)) {
    return { ok: false, message: `Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}` }
  }

  const svc = requireServiceClient()

  // Read existing sender
  const { data: existing } = await svc
    .from('whatsapp_authorized_senders')
    .select('*')
    .eq('id', senderId)
    .maybeSingle()

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

  // Activation requires verified timestamp
  if (newStatus === 'active' && !sender.verified_at) {
    return {
      ok: false,
      message: 'Cannot activate sender without a verification timestamp. Verify the phone number first.',
    }
  }

  const patch: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }

  const { error: updateErr } = await svc
    .from('whatsapp_authorized_senders')
    .update(patch)
    .eq('id', senderId)

  if (updateErr) {
    console.error('[admin-whatsapp-accounts] setWhatsAppSenderStatus error:', updateErr.message)
    return { ok: false, message: updateErr.message }
  }

  revalidatePath('/admin/whatsapp')
  void logAdminAction({
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
  const { data: existing } = await svc
    .from('whatsapp_authorized_senders')
    .select('*')
    .eq('id', senderId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, message: 'Sender not found.' }
  }

  const sender = existing as WhatsAppSenderRow

  if (sender.status === 'suspended') {
    return { ok: false, message: 'Sender is already suspended.' }
  }

  const { error: updateErr } = await svc
    .from('whatsapp_authorized_senders')
    .update({
      status: 'suspended',
      updated_at: new Date().toISOString(),
    })
    .eq('id', senderId)

  if (updateErr) {
    console.error('[admin-whatsapp-accounts] removeWhatsAppSender error:', updateErr.message)
    return { ok: false, message: updateErr.message }
  }

  revalidatePath('/admin/whatsapp')
  void logAdminAction({
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
