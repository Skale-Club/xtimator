import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

type ConversationRow = {
  id: string
  company_id: string
  contact_phone: string
  contact_name: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_inbound_at: string | null
  unread_count: number
}

export default async function AdminWhatsAppPage() {
  await requireAdmin()

  const svc = requireServiceClient()

  const { data: convData } = await svc
    .from('whatsapp_conversations')
    .select(
      'id, company_id, contact_phone, contact_name, last_message_at, last_message_preview, last_inbound_at, unread_count'
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(500)

  const conversations = (convData ?? []) as ConversationRow[]

  const { data: companyData } = await svc.from('companies').select('id, name')
  const companyNames = new Map(
    (companyData ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
  )

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>WhatsApp</T>
        </h1>
        <p className="text-muted-foreground">
          <T>
            Every phone number that has sent a WhatsApp message to the platform, across all tenant
            companies. Read-only.
          </T>
        </p>
        <p className="text-xs text-muted-foreground">
          {conversations.length === 0 ? (
            <T>No WhatsApp conversations yet.</T>
          ) : (
            <T text={`${conversations.length} numbers total.`} />
          )}
        </p>
      </div>

      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Company</th>
                <th className="text-left px-4 py-3 font-medium">Unread</th>
                <th className="text-left px-4 py-3 font-medium">Last message</th>
                <th className="text-left px-4 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conversations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <T>No conversations found.</T>
                  </td>
                </tr>
              ) : (
                conversations.map((row) => {
                  const companyName = companyNames.get(row.company_id)
                  const ts = row.last_message_at ?? row.last_inbound_at
                  return (
                    <tr key={row.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">{row.contact_phone}</td>
                      <td className="px-4 py-3">
                        {row.contact_name ? (
                          row.contact_name
                        ) : (
                          <span className="text-muted-foreground">
                            <T>(unknown)</T>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {companyName ? (
                          companyName
                        ) : (
                          <span className="text-muted-foreground">
                            <T>(unknown company)</T>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{row.unread_count}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block max-w-[280px] truncate text-muted-foreground">
                          {row.last_message_preview ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {ts ? new Date(ts).toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
