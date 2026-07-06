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
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  page: z.coerce.number().int().positive().default(1),
})

export type AdminWhatsAppFilters = z.infer<typeof adminWhatsAppFilterSchema>

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
    dateFrom: f.dateFrom ? new Date(f.dateFrom) : undefined,
    dateTo: f.dateTo ? new Date(f.dateTo) : undefined,
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

  // ── Main paginated query ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mainQ: any = svc
    .from('whatsapp_conversations')
    .select('id, company_id, contact_phone, contact_name, last_message_at, last_message_preview, last_inbound_at, unread_count', { count: 'exact' })

  if (companyId) mainQ = mainQ.eq('company_id', companyId)
  if (status) mainQ = mainQ.eq('whatsapp_company_configs.status', status)
  if (unreadOnly) mainQ = mainQ.gt('unread_count', 0)
  if (dateFrom) mainQ = mainQ.gte('last_message_at', dateFrom.toISOString())
  if (dateTo) mainQ = mainQ.lte('last_message_at', dateTo.toISOString())
  if (q) {
    mainQ = mainQ.or(`contact_phone.ilike.%${q}%,contact_name.ilike.%${q}%`)
  }

  // When filtering by sender, we need to join through authorized_senders → conversations
  // via company_id. The sender's company_id narrows the conversation set.
  if (senderId) {
    const { data: senderData } = await svc
      .from('whatsapp_authorized_senders')
      .select('company_id')
      .eq('id', senderId)
      .maybeSingle()

    if (senderData) {
      mainQ = mainQ.eq('company_id', senderData.company_id)
    }
    // If sender not found, return empty result
    if (!senderData) {
      return {
        rows: [],
        total: 0,
        page,
        pageCount: 0,
        companyNames: new Map(),
        senderLabels: new Map(),
      }
    }
  }

  const { data: convData, count } = await mainQ
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const conversations = (convData ?? []) as AdminWhatsAppConversationRow[]
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
