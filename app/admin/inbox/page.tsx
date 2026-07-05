import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { T } from '@/components/i18n/t'
import {
  parseAdminWhatsAppFilters,
  listAdminWhatsAppConversations,
} from '@/lib/queries/admin-whatsapp'
import { AdminWhatsAppClient } from './admin-whatsapp-client'
import { AdminWhatsAppFilters } from './admin-whatsapp-filters'

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

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin()

  const sp = await searchParams
  const filters = parseAdminWhatsAppFilters(sp)
  const initialConversationId = typeof sp.conversation === 'string' ? sp.conversation : null

  const convResult = await listAdminWhatsAppConversations(filters)

  const rows: Row[] = convResult.rows.map((row) => ({
    ...row,
    company_name: convResult.companyNames.get(row.company_id) ?? null,
  }))

  // Build pagination URL preserving all active filters
  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (filters.companyId) params.set('companyId', filters.companyId)
    if (filters.senderId) params.set('senderId', filters.senderId)
    if (filters.q) params.set('q', filters.q)
    if (filters.status) params.set('status', filters.status)
    if (filters.unreadOnly) params.set('unreadOnly', 'true')
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString())
    if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString())
    params.set('page', String(p))
    return `/admin/inbox?${params.toString()}`
  }

  const hasActiveFilters =
    filters.companyId || filters.senderId || filters.q || filters.status || filters.unreadOnly || filters.dateFrom || filters.dateTo

  return (
    <div className="flex h-full min-h-0 flex-col space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
            <T>Inbox</T>
          </h1>
          <p className="text-muted-foreground">
            <T>
              Platform-managed conversations across every connected channel. Read-only conversation inspection.
            </T>
          </p>
        </div>
        <Link
          href="/admin/inbox/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground shrink-0 mt-1"
        >
          <Settings2 size={16} /> <T>Settings</T>
        </Link>
      </div>

      {/* Conversations count */}
      <p className="text-xs text-muted-foreground">
        {convResult.total === 0 && !hasActiveFilters ? (
          <T>No WhatsApp conversations yet.</T>
        ) : (
          <T text={`${convResult.total} conversations · Page ${convResult.page} of ${convResult.pageCount}`} />
        )}
      </p>

      {/* Two-pane master-detail viewer */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AdminWhatsAppClient
          conversations={rows}
          initialConversationId={initialConversationId}
          filtersSlot={
            <AdminWhatsAppFilters
              companyId={filters.companyId}
              senderId={filters.senderId}
              q={filters.q}
              status={filters.status}
              unreadOnly={filters.unreadOnly}
              dateFrom={filters.dateFrom?.toISOString().slice(0, 10)}
              dateTo={filters.dateTo?.toISOString().slice(0, 10)}
            />
          }
          paginationSlot={
            convResult.pageCount > 1 ? (
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
            ) : null
          }
        />
      </div>
    </div>
  )
}
