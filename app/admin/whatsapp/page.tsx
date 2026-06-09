import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { T } from '@/components/i18n/t'
import { AdminWhatsAppClient } from './admin-whatsapp-client'

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

type Row = ConversationRow & { company_name: string | null }

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

  const rows: Row[] = conversations.map((row) => ({
    ...row,
    company_name: companyNames.get(row.company_id) ?? null,
  }))

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

      <AdminWhatsAppClient conversations={rows} />
    </div>
  )
}
