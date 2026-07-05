import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { parseAdminWhatsAppFilters } from '@/lib/queries/admin-whatsapp'
import { listTemplates } from '@/lib/actions/admin-whatsapp-templates'
import { WhatsAppTemplatesPanel } from '@/components/admin/whatsapp-templates-panel'
import { AdminWhatsAppAccounts } from './admin-whatsapp-accounts'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

const TAB_TRIGGER_CLASSES =
  'h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-3 gap-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary dark:data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground after:hidden transition-colors'

export default async function AdminInboxSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  // requireAdmin FIRST — the page reads/writes via the service client which
  // bypasses RLS, so this gate is the real access control.
  await requireAdmin()

  const sp = await searchParams
  const filters = parseAdminWhatsAppFilters(sp)
  const initialTab = sp.tab === 'templates' ? 'templates' : 'accounts'

  const svc = requireServiceClient()

  const [configResult, senderResult, templates] = await Promise.all([
    svc
      .from('whatsapp_company_configs')
      .select('id, company_id, status, delivery_format, review_reason, created_at, updated_at')
      .then(({ data }) => (data ?? []) as Array<{
        id: string; company_id: string; status: string; delivery_format: string; review_reason: string | null
      }>),
    svc
      .from('whatsapp_authorized_senders')
      .select('id, company_id, config_id, user_id, phone_e164, status, created_by_admin, verified_at, created_at, updated_at')
      .then(({ data }) => (data ?? []) as Array<{
        id: string; company_id: string; config_id: string; user_id: string | null; phone_e164: string; status: string; created_by_admin: boolean | null; verified_at: string | null
      }>),
    listTemplates(),
  ])

  return (
    <div className="space-y-8">
      <Link href="/admin/inbox" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft size={16} /> <T>Back to Inbox</T>
      </Link>

      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Inbox Settings</T>
        </h1>
        <p className="text-muted-foreground">
          <T>Manage WhatsApp account provisioning and message templates.</T>
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="w-full gap-5">
        <div className="border-b border-border">
          <TabsList variant="line" className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start">
            <TabsTrigger value="accounts" className={TAB_TRIGGER_CLASSES}>
              <T>Accounts</T>
            </TabsTrigger>
            <TabsTrigger value="templates" className={TAB_TRIGGER_CLASSES}>
              <T>Templates</T>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="accounts" className="mt-0">
          <AdminWhatsAppAccounts configs={configResult} senders={senderResult} companyId={filters.companyId} />
        </TabsContent>
        <TabsContent value="templates" className="mt-0">
          <WhatsAppTemplatesPanel templates={templates} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
