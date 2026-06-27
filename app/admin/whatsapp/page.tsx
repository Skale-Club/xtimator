import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { T } from '@/components/i18n/t'
import {
  parseAdminWhatsAppFilters,
  listAdminWhatsAppConversations,
} from '@/lib/queries/admin-whatsapp'
import { AdminWhatsAppClient } from './admin-whatsapp-client'
import { AdminWhatsAppFilters } from './admin-whatsapp-filters'
import { AdminWhatsAppAccounts } from './admin-whatsapp-accounts'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  company_id: string
  contact_phone: string
  contact_name: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_inbound_at: string | null
  unread_count: number
  company_name: string | null
}

export default async function AdminWhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin()

  const sp = await searchParams
  const filters = parseAdminWhatsAppFilters(sp)
  const tab = sp.tab === 'accounts' ? 'accounts' : 'conversations'

  // Fetch account provisioning data when on accounts tab (or always for simplicity)
  const svc = requireServiceClient()

  const [convResult, configResult, senderResult] = await Promise.all([
    listAdminWhatsAppConversations(filters),
    svc
      .from('whatsapp_company_configs')
      .select('id, company_id, status, delivery_format, review_reason, created_at, updated_at')
      .then(({ data }) => (data ?? []) as Array<{
        id: string
        company_id: string
        status: string
        delivery_format: string
        review_reason: string | null
      }>),
    svc
      .from('whatsapp_authorized_senders')
      .select('id, company_id, config_id, user_id, phone_e164, status, created_by_admin, verified_at, created_at, updated_at')
      .then(({ data }) => (data ?? []) as Array<{
        id: string
        company_id: string
        config_id: string
        user_id: string | null
        phone_e164: string
        status: string
        created_by_admin: boolean | null
        verified_at: string | null
      }>),
  ])

  const rows: Row[] = convResult.rows.map((row) => ({
    ...row,
    company_name: convResult.companyNames.get(row.company_id) ?? null,
  }))

  // Build pagination URL preserving all active filters + tab
  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (tab === 'accounts') params.set('tab', 'accounts')
    if (filters.companyId) params.set('companyId', filters.companyId)
    if (filters.senderId) params.set('senderId', filters.senderId)
    if (filters.q) params.set('q', filters.q)
    if (filters.status) params.set('status', filters.status)
    if (filters.unreadOnly) params.set('unreadOnly', 'true')
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString())
    if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString())
    params.set('page', String(p))
    return `/admin/whatsapp?${params.toString()}`
  }

  // Tab URL helper
  function tabUrl(t: string) {
    const params = new URLSearchParams()
    if (t === 'accounts') params.set('tab', 'accounts')
    if (filters.companyId) params.set('companyId', filters.companyId)
    if (filters.senderId) params.set('senderId', filters.senderId)
    if (filters.q) params.set('q', filters.q)
    if (filters.status) params.set('status', filters.status)
    if (filters.unreadOnly) params.set('unreadOnly', 'true')
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString())
    if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString())
    return `/admin/whatsapp?${params.toString()}`
  }

  const hasActiveFilters =
    filters.companyId || filters.senderId || filters.q || filters.status || filters.unreadOnly || filters.dateFrom || filters.dateTo

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>WhatsApp</T>
        </h1>
        <p className="text-muted-foreground">
          <T>
            Platform-managed WhatsApp accounts and conversations. Read-only conversation inspection and admin-only provisioning.
          </T>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <Link
          href={tabUrl('conversations')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'conversations'
              ? 'border-[hsl(var(--primary))] text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <T>Conversations</T>
        </Link>
        <Link
          href={tabUrl('accounts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'accounts'
              ? 'border-[hsl(var(--primary))] text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <T>Accounts</T>
        </Link>
      </div>

      {tab === 'accounts' ? (
        /* ── Accounts / Provisioning view ── */
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            <T>Manage WhatsApp account configurations and authorized senders for each company.</T>
          </p>
          <AdminWhatsAppAccounts
            configs={configResult}
            senders={senderResult}
            companyId={filters.companyId}
          />
        </div>
      ) : (
        /* ── Conversations view ── */
        <div className="space-y-6">
          {/* Filters */}
          <AdminWhatsAppFilters
            companyId={filters.companyId}
            senderId={filters.senderId}
            q={filters.q}
            status={filters.status}
            unreadOnly={filters.unreadOnly}
            dateFrom={filters.dateFrom?.toISOString().slice(0, 10)}
            dateTo={filters.dateTo?.toISOString().slice(0, 10)}
          />

          {/* Conversations count */}
          <p className="text-xs text-muted-foreground">
            {convResult.total === 0 && !hasActiveFilters ? (
              <T>No WhatsApp conversations yet.</T>
            ) : (
              <T text={`${convResult.total} conversations · Page ${convResult.page} of ${convResult.pageCount}`} />
            )}
          </p>

          {/* Conversations table */}
          <AdminWhatsAppClient conversations={rows} />

          {/* Pagination */}
          {convResult.pageCount > 1 && (
            <div className="flex items-center gap-2 text-sm">
              {convResult.page > 1 ? (
                <Link href={pageUrl(convResult.page - 1)} className="text-[hsl(var(--primary))] hover:underline">
                  <T>Previous</T>
                </Link>
              ) : (
                <span className="text-muted-foreground"><T>Previous</T></span>
              )}
              <span className="text-muted-foreground">
                <T text={`Page ${convResult.page} of ${convResult.pageCount}`} />
              </span>
              {convResult.page < convResult.pageCount ? (
                <Link href={pageUrl(convResult.page + 1)} className="text-[hsl(var(--primary))] hover:underline">
                  <T>Next</T>
                </Link>
              ) : (
                <span className="text-muted-foreground"><T>Next</T></span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
