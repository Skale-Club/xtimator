import 'server-only'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'

// ─── Filter Schema ───────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const adminWhatsAppFilterSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  senderId: z.string().uuid().optional().nullable(),
  q: z.string().max(200).optional().nullable(),
  status: z.enum(['active', 'suspended', 'pending_review']).optional().nullable(),
  unreadOnly: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .nullable(),
  page: z.coerce.number().int().positive().default(1),
})

export type ParsedAdminWhatsAppFilters = {
  companyId: string | undefined
  senderId: string | undefined
  q: string | undefined
  status: string | undefined
  unreadOnly: boolean
  dateFrom: Date | undefined
  dateTo: Date | undefined
  page: number
}

function parseCalendarDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : undefined
}

/**
 * Parse and normalize raw search params into validated filter values.
 * Defaults: page=1, unreadOnly=false, all other filters undefined.
 */
export function parseAdminWhatsAppFilters(
  raw: Record<string, string | undefined>,
): ParsedAdminWhatsAppFilters {
  const parsed = adminWhatsAppFilterSchema.safeParse(raw)
  const f = parsed.success ? parsed.data : { page: 1 }

  return {
    companyId: f.companyId ?? undefined,
    senderId: f.senderId ?? undefined,
    q: f.q?.trim() || undefined,
    status: f.status ?? undefined,
    unreadOnly: f.unreadOnly === 'true' || f.unreadOnly === '1',
    dateFrom: parseCalendarDate(raw.dateFrom),
    dateTo: parseCalendarDate(raw.dateTo),
    page: f.page ?? 1,
  }
}

// ─── Query Result ────────────────────────────────────────────────────────────

export type AdminWhatsAppConversationRow = {
  id: string
  company_id: string
  contact_phone: string
  contact_name: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_inbound_at: string | null
  unread_count: number
}

export type AdminWhatsAppListResult = {
  rows: AdminWhatsAppConversationRow[]
  total: number
  page: number
  pageCount: number
  companyNames: Map<string, string>
  senderLabels: Map<string, string>
  error?: string
}

/**
 * Server-side filtered, paginated admin conversation list.
 *
 * Requires admin authorization. Applies all filters server-side before
 * range/pagination. Fetches company and sender labels only for result IDs
 * to avoid the all-companies + 500-conversations overfetch.
 *
 * Ordering: `last_message_at DESC NULLS LAST, id DESC` for deterministic pagination.
 */
export async function listAdminWhatsAppConversations(
  filters: ParsedAdminWhatsAppFilters,
): Promise<AdminWhatsAppListResult> {
  await requireAdmin()
  const svc = requireServiceClient()

  const { companyId, senderId, q, status, unreadOnly, dateFrom, dateTo, page } = filters
  const from = (page - 1) * PAGE_SIZE

  const emptyResult: AdminWhatsAppListResult = {
    rows: [],
    total: 0,
    page,
    pageCount: 0,
    companyNames: new Map(),
    senderLabels: new Map(),
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { ...emptyResult, error: 'The start date must be on or before the end date.' }
  }

  const conversationFields =
    'id, company_id, contact_phone, contact_name, last_message_at, last_message_preview, last_inbound_at, unread_count'
  // Both tables reference companies. Inner embeddings apply the account filter
  // before the conversation count and range are evaluated.
  let mainQ = svc
    .from('whatsapp_conversations')
    .select(
      status
        ? `${conversationFields}, companies!inner(whatsapp_company_configs!inner(status))`
        : conversationFields,
      { count: 'exact' },
    )

  if (companyId) mainQ = mainQ.eq('company_id', companyId)
  if (status) mainQ = mainQ.eq('companies.whatsapp_company_configs.status', status)
  if (unreadOnly) mainQ = mainQ.gt('unread_count', 0)
  if (dateFrom) mainQ = mainQ.gte('last_message_at', dateFrom.toISOString())
  if (dateTo) {
    const nextDay = new Date(dateTo)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    mainQ = mainQ.lt('last_message_at', nextDay.toISOString())
  }
  if (q) {
    const pattern = `"%${q.replace(/[\\"]/g, '\\$&')}%"`
    mainQ = mainQ.or(`contact_phone.ilike.${pattern},contact_name.ilike.${pattern}`)
  }

  if (senderId) {
    const { data: senderData, error } = await svc
      .from('whatsapp_authorized_senders')
      .select('company_id, phone_e164')
      .eq('id', senderId)
      .maybeSingle()

    if (error) {
      console.error('[admin-whatsapp] sender filter failed:', error.message)
      return { ...emptyResult, error: 'Could not load WhatsApp conversations.' }
    }
    if (!senderData) return emptyResult
    mainQ = mainQ.eq('company_id', senderData.company_id).eq('contact_phone', senderData.phone_e164)
  }

  const { data: convData, count, error } = await mainQ
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  if (error) {
    console.error('[admin-whatsapp] inbox list failed:', error.message)
    return { ...emptyResult, error: 'Could not load WhatsApp conversations.' }
  }
  const conversations = (convData ?? []) as unknown as AdminWhatsAppConversationRow[]
  const total = count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Enrich: company labels (only for result IDs) ────────────────────────────
  const companyIds = [...new Set(conversations.map((r) => r.company_id))]
  const companyNames = new Map<string, string>()
  if (companyIds.length > 0) {
    const { data: companyData } = await svc
      .from('companies')
      .select('id, name')
      .in('id', companyIds)
    for (const c of (companyData ?? []) as { id: string; name: string }[]) {
      companyNames.set(c.id, c.name)
    }
  }

  // ── Enrich: sender labels (authorized members/numbers) for conversations ────
  const senderLabels = new Map<string, string>()
  if (companyIds.length > 0) {
    const { data: senderData } = await svc
      .from('whatsapp_authorized_senders')
      .select('id, phone_e164, user_id, status')
      .in('company_id', companyIds)
      .eq('status', 'active')
    for (const s of (senderData ?? []) as {
      id: string
      phone_e164: string
      user_id: string | null
      status: string
    }[]) {
      // Label: last 4 digits of phone, or user_id prefix
      const label = s.phone_e164
        ? `···${s.phone_e164.slice(-4)}`
        : s.user_id
          ? `user:${s.user_id.slice(0, 8)}`
          : s.id.slice(0, 8)
      senderLabels.set(s.id, label)
    }
  }

  return {
    rows: conversations,
    total,
    page,
    pageCount,
    companyNames,
    senderLabels,
  }
}
