/**
 * Server-only WhatsApp account registry — the single read boundary for
 * account status and authorized sender resolution.
 *
 * All admin, webhook, and outbound gates consume this module instead of
 * reading company_whatsapp / whatsapp_company_configs / whatsapp_authorized_senders
 * directly. This enforces the authority-model split (company config vs sender identity)
 * and prevents tenants from accessing provisioning or conversation data.
 *
 * RLS posture: both tables are deny-all for anon/authenticated; always uses
 * the service-role client.
 */
import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'

// ─── Phone normalization ─────────────────────────────────────────────────────

/**
 * Normalize a raw phone string to E.164 format (leading '+', digits only).
 * Returns null for inputs that cannot form a valid E.164 number.
 */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!/^\+?[\d().\s-]+$/.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, '')
  if (!/^[1-9]\d{6,14}$/.test(digits)) return null
  return `+${digits}`
}

/** Return the last 4 digits of an E.164 phone for safe logging. */
function lastFour(phoneE164: string): string {
  return phoneE164.slice(-4)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhatsAppAccountStatus {
  /** Whether a config row exists for this company */
  configured: boolean
  /** Whether the config is in 'active' status */
  active: boolean
  /** The raw config status ('pending_review' | 'active' | 'suspended' | absent) */
  status: string | null
  /** The configured delivery format */
  deliveryFormat: string | null
}

export interface WhatsAppSenderMatch {
  companyId: string
  userId: string | null
  phoneE164: string
}

type SenderAuthorityRow = {
  company_id: string
  user_id: string | null
  phone_e164: string
  authorized: boolean
}

type AuthorityReadOptions = { throwOnError?: boolean }

// ─── Account status ──────────────────────────────────────────────────────────

/**
 * Return the opaque WhatsApp account status for a company.
 * Exposes NO linked number, WABA ID, token, or conversation data.
 */
export async function getWhatsAppAccountStatus(
  companyId: string,
): Promise<WhatsAppAccountStatus> {
  const svc = requireServiceClient()

  const { data, error } = await svc
    .from('whatsapp_company_configs')
    .select('status, delivery_format')
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) {
    console.warn(
      `[account-registry] getWhatsAppAccountStatus read failed for company ${companyId.slice(0, 8)}…:`,
      error.message,
    )
    return { configured: false, active: false, status: null, deliveryFormat: null }
  }

  if (!data) {
    return { configured: false, active: false, status: null, deliveryFormat: null }
  }

  return {
    configured: true,
    active: data.status === 'active',
    status: data.status,
    deliveryFormat: data.delivery_format,
  }
}

// ─── Sender resolution ───────────────────────────────────────────────────────

/**
 * Resolve an inbound sender phone to exactly one active authorized sender.
 *
 * Returns `{ companyId, userId, phoneE164 }` on an exact match.
 * Returns null when:
 *   - No active sender has this phone (unknown sender)
 *   - Multiple active senders share this phone
 *   - The sender, account, or company no longer has authority
 *
 * NEVER uses `.maybeSingle()` — ambiguity is a first-class signal.
 * Caps at 2 rows to detect duplicates without fetching unbounded data.
 * Logs only the last 4 digits of the phone on zero/ambiguous results.
 */
export async function findActiveWhatsAppSender(
  phoneE164: string,
  options: AuthorityReadOptions = {},
): Promise<WhatsAppSenderMatch | null> {
  const normalized = normalizeWhatsAppPhone(phoneE164)
  if (!normalized) {
    console.warn(
      `[account-registry] findActiveWhatsAppSender: invalid phone input`,
    )
    return null
  }

  let data: SenderAuthorityRow[] | null
  try {
    const result = await requireServiceClient().rpc('resolve_whatsapp_sender_authority', {
      p_phone_e164: normalized,
    })
    if (result.error) throw new Error('WhatsApp sender authority lookup failed')
    data = result.data as SenderAuthorityRow[] | null
  } catch (error) {
    if (options.throwOnError) throw error
    console.warn(
      `[account-registry] findActiveWhatsAppSender query failed for ...${lastFour(normalized)}`,
    )
    return null
  }

  if (!data || data.length === 0) {
    // Zero matches — unknown sender
    console.warn(
      `[account-registry] findActiveWhatsAppSender: no active sender for ...${lastFour(normalized)}`,
    )
    return null
  }

  if (data.length > 1) {
    // Ambiguity — multiple active senders for the same phone (should not happen
    // if the partial unique index is enforced, but we defend anyway)
    console.warn(
      `[account-registry] findActiveWhatsAppSender: ambiguous — ${data.length} active senders for ...${lastFour(normalized)}`,
    )
    return null
  }

  const row = data[0]
  if (row.authorized !== true) return null
  return {
    companyId: row.company_id,
    userId: row.user_id,
    phoneE164: row.phone_e164,
  }
}

/** Recheck a queued sender's authority and require the same company and user. */
export async function revalidateWhatsAppSender(
  expected: WhatsAppSenderMatch,
  options: AuthorityReadOptions = {},
): Promise<boolean> {
  const current = await findActiveWhatsAppSender(expected.phoneE164, options)
  return Boolean(
    current &&
      current.companyId === expected.companyId &&
      current.userId === expected.userId &&
      current.phoneE164 === normalizeWhatsAppPhone(expected.phoneE164),
  )
}

/** Check whether a phone can be linked to an enabled member's account. */
export async function isCurrentWhatsAppLinkedIdentity(
  companyId: string,
  userId: string,
  phoneE164: string,
): Promise<boolean> {
  const { data, error } = await requireServiceClient().rpc('whatsapp_linked_identity_is_current', {
    p_company_id: companyId,
    p_user_id: userId,
    p_phone_e164: phoneE164,
  })
  if (error) throw new Error('WhatsApp linked identity lookup failed')
  return data === true
}
