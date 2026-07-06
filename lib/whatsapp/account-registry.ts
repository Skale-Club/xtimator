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
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/[^\d]/g, '')
  if (!digits) return null
  const e164 = digits.startsWith('+') ? `+${digits.slice(1)}` : `+${digits}`
  const numericPart = e164.slice(1)
  if (numericPart.length < 7 || numericPart.length > 15) return null
  return e164
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
 *   - Multiple active senders share this phone (ambiguity — needs admin review)
 *
 * NEVER uses `.maybeSingle()` — ambiguity is a first-class signal.
 * Caps at 2 rows to detect duplicates without fetching unbounded data.
 * Logs only the last 4 digits of the phone on zero/ambiguous results.
 */
export async function findActiveWhatsAppSender(
  phoneE164: string,
): Promise<WhatsAppSenderMatch | null> {
  const normalized = normalizeWhatsAppPhone(phoneE164)
  if (!normalized) {
    console.warn(
      `[account-registry] findActiveWhatsAppSender: invalid phone input`,
    )
    return null
  }

  const svc = requireServiceClient()

  const { data, error } = await svc
    .from('whatsapp_authorized_senders')
    .select('company_id, user_id, phone_e164')
    .eq('phone_e164', normalized)
    .eq('status', 'active')
    .limit(2)

  if (error) {
    console.warn(
      `[account-registry] findActiveWhatsAppSender query failed for ...${lastFour(normalized)}:`,
      error.message,
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
  return {
    companyId: row.company_id,
    userId: row.user_id,
    phoneE164: row.phone_e164,
  }
}
