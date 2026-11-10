/**
 * Server-only automatic WhatsApp sender linking.
 *
 * The owner route of the WhatsApp webhook resolves a phone through
 * `whatsapp_authorized_senders` (see account-registry.ts). Rows used to be created
 * only by a platform admin. This module links the VERIFIED signup phone of a user
 * to the user's company automatically, so a new account can use the bot right
 * after onboarding with no admin action.
 *
 * Rules:
 *   - Only a verified phone (xtimator_accounts.phone + phone_confirmed_at) is linked.
 *   - One active phone globally (partial unique index). If the phone is already
 *     active for ANOTHER company we never link a second time; ops is alerted with
 *     company ids and the last 4 digits only (multi-company owners are not designed).
 *   - An admin-suspended row stays suspended (never silently reactivated).
 *   - Every export is best-effort and NEVER throws into its caller.
 *
 * Both tables are RLS deny-all: service-role client only. This module is not a
 * 'use server' file, so none of these functions is exposed as a public action.
 */
import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { requireDataServiceClient } from '@/lib/supabase/data-service'
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/account-registry'
import { notifyOps } from '@/lib/observability/ops-alert'

export type EnsureSenderStatus =
  | 'linked' // a row was created or reactivated
  | 'already_linked' // an active row for (phone, company) already exists
  | 'conflict' // phone is active for another company (ops alerted)
  | 'no_verified_phone'
  | 'not_member'
  | 'blocked' // admin-suspended sender or suspended company config
  | 'error'

export interface EnsureSenderResult {
  status: EnsureSenderStatus
  phoneE164?: string
}

export type OwnerCandidate = { userId: string; companyId: string; phoneE164: string }

function lastFour(phone: string): string {
  return phone.slice(-4)
}

/** The user's verified phone in E.164, or null when there is none. */
export async function getVerifiedPhone(userId: string): Promise<string | null> {
  const { data, error } = await requireDataServiceClient()
    .from('xtimator_accounts')
    .select('phone, phone_confirmed_at')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data?.phone || !data.phone_confirmed_at) return null
  return normalizeWhatsAppPhone(data.phone as string)
}

/** Company ids the user owns or is an active member of (deduplicated). */
async function companiesOfUser(userId: string): Promise<string[]> {
  const svc = requireServiceClient()
  const [members, owned] = await Promise.all([
    svc.from('company_members').select('company_id').eq('user_id', userId),
    svc.from('companies').select('id').eq('user_id', userId),
  ])
  if (members.error || owned.error) throw new Error('company lookup failed')
  const ids = [
    ...(members.data ?? []).map((r: { company_id: string }) => r.company_id),
    ...(owned.data ?? []).map((r: { id: string }) => r.id),
  ]
  return [...new Set(ids)]
}

type SenderRow = {
  id: string
  company_id: string
  user_id: string | null
  status: string
  created_by_admin: boolean | null
}

/**
 * Create (or reactivate) the active authorized-sender row for the user's verified
 * phone in the given company. Idempotent. Never throws.
 */
export async function ensureWhatsAppSenderForUser(
  userId: string,
  companyId: string,
): Promise<EnsureSenderResult> {
  try {
    if (!userId || !companyId) return { status: 'error' }
    const phone = await getVerifiedPhone(userId)
    if (!phone) return { status: 'no_verified_phone' }

    const svc = requireServiceClient()

    const companyIds = await companiesOfUser(userId)
    if (!companyIds.includes(companyId)) return { status: 'not_member', phoneE164: phone }

    const { data: rows, error: rowsErr } = await svc
      .from('whatsapp_authorized_senders')
      .select('id, company_id, user_id, status, created_by_admin')
      .eq('phone_e164', phone)
      .limit(20)
    if (rowsErr) throw new Error(rowsErr.message)
    const senders = (rows ?? []) as SenderRow[]

    const elsewhere = senders.find((r) => r.status === 'active' && r.company_id !== companyId)
    if (elsewhere) {
      void notifyOps({
        kind: 'whatsapp_link_conflict',
        severity: 'warning',
        title: 'WhatsApp phone already linked to another company',
        message: 'A verified signup phone could not be linked automatically.',
        dedupeKey: `whatsapp_link_conflict:${companyId}:${elsewhere.company_id}`,
        fields: [
          ['Phone (last 4)', lastFour(phone)],
          ['Company that tried to link', companyId],
          ['Company already linked', elsewhere.company_id],
          ['User', userId],
        ],
      })
      return { status: 'conflict', phoneE164: phone }
    }

    const own = senders.filter((r) => r.company_id === companyId)
    const active = own.find((r) => r.status === 'active')
    if (active) {
      if (!active.user_id) {
        await svc
          .from('whatsapp_authorized_senders')
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq('id', active.id)
      }
      return { status: 'already_linked', phoneE164: phone }
    }

    // Reactivate our own earlier rows (deactivated on a phone change) and rows still
    // waiting for review; never undo an explicit admin suspension.
    const reusable = own.find((r) => r.status === 'pending_review' || r.created_by_admin !== true)
    if (own.length > 0 && !reusable) return { status: 'blocked', phoneE164: phone }

    const nowIso = new Date().toISOString()
    if (reusable) {
      const { error } = await svc
        .from('whatsapp_authorized_senders')
        .update({ status: 'active', user_id: userId, verified_at: nowIso, updated_at: nowIso })
        .eq('id', reusable.id)
      if (error) {
        if (error.code === '23505') return { status: 'conflict', phoneE164: phone }
        throw new Error(error.message)
      }
      return { status: 'linked', phoneE164: phone }
    }

    // Config row: one per company. Created active here (no admin step); a suspended
    // config is an explicit platform decision and is respected.
    const { data: cfg, error: cfgErr } = await svc
      .from('whatsapp_company_configs')
      .select('id, status')
      .eq('company_id', companyId)
      .maybeSingle()
    if (cfgErr) throw new Error(cfgErr.message)
    let configId = (cfg as { id: string } | null)?.id ?? null
    if ((cfg as { status?: string } | null)?.status === 'suspended') {
      return { status: 'blocked', phoneE164: phone }
    }
    if (!configId) {
      const { data: created, error: createErr } = await svc
        .from('whatsapp_company_configs')
        .insert({ company_id: companyId, status: 'active', delivery_format: 'share_link' })
        .select('id')
        .single()
      if (createErr) {
        if (createErr.code !== '23505') throw new Error(createErr.message)
        const { data: again } = await svc
          .from('whatsapp_company_configs')
          .select('id')
          .eq('company_id', companyId)
          .maybeSingle()
        configId = (again as { id: string } | null)?.id ?? null
      } else {
        configId = (created as { id: string } | null)?.id ?? null
      }
    }
    if (!configId) throw new Error('config unavailable')

    const { error: insertErr } = await svc.from('whatsapp_authorized_senders').insert({
      company_id: companyId,
      config_id: configId,
      phone_e164: phone,
      user_id: userId,
      status: 'active',
      verified_at: nowIso,
      created_by_admin: false,
    })
    if (insertErr) {
      // Lost a race on the partial unique index: another company took the phone.
      if (insertErr.code === '23505') return { status: 'conflict', phoneE164: phone }
      throw new Error(insertErr.message)
    }
    return { status: 'linked', phoneE164: phone }
  } catch (err) {
    console.warn(
      '[sender-link] ensureWhatsAppSenderForUser failed:',
      err instanceof Error ? err.message : String(err),
    )
    return { status: 'error' }
  }
}

/**
 * After a verified phone change: suspend the user's active sender rows that carry a
 * different phone, then link the new phone (single-company users only). Never throws.
 */
export async function syncWhatsAppSenderAfterPhoneChange(userId: string): Promise<void> {
  try {
    const phone = await getVerifiedPhone(userId)
    const svc = requireServiceClient()
    let query = svc
      .from('whatsapp_authorized_senders')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')
    if (phone) query = query.neq('phone_e164', phone)
    const { error } = await query
    if (error) throw new Error(error.message)
    if (!phone) return
    const companyIds = await companiesOfUser(userId)
    if (companyIds.length === 1) await ensureWhatsAppSenderForUser(userId, companyIds[0])
  } catch (err) {
    console.warn(
      '[sender-link] syncWhatsAppSenderAfterPhoneChange failed:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Read-only lookup for the webhook's lazy link: the single user whose VERIFIED phone
 * is `phoneE164` and who belongs to exactly one company. Zero matches, several users
 * or several companies all return null (ambiguity is logged with the last 4 digits).
 */
export async function findOwnerCandidateByVerifiedPhone(
  phoneE164: string,
): Promise<OwnerCandidate | null> {
  try {
    const phone = normalizeWhatsAppPhone(phoneE164)
    if (!phone) return null
    const { data, error } = await requireDataServiceClient()
      .from('xtimator_accounts')
      .select('id')
      .eq('phone', phone)
      .not('phone_confirmed_at', 'is', null)
      .is('disabled_at', null)
      .limit(2)
    if (error) throw new Error(error.message)
    const users = (data ?? []) as Array<{ id: string }>
    if (users.length === 0) return null
    if (users.length > 1) {
      console.warn(`[sender-link] lazy link ambiguous: ${users.length} users for ...${lastFour(phone)}`)
      return null
    }
    const companyIds = await companiesOfUser(users[0].id)
    if (companyIds.length !== 1) {
      if (companyIds.length > 1) {
        console.warn(
          `[sender-link] lazy link ambiguous: user has ${companyIds.length} companies for ...${lastFour(phone)}`,
        )
      }
      return null
    }
    return { userId: users[0].id, companyId: companyIds[0], phoneE164: phone }
  } catch (err) {
    console.warn(
      '[sender-link] findOwnerCandidateByVerifiedPhone failed:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
