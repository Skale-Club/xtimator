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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getWhatsAppDisplayNumber, getWhatsAppPlatformConfig, getWhatsAppWelcomeConfig } from '@/lib/platform-config'
import { getWhatsAppReadiness } from '@/lib/whatsapp/readiness'
import { WhatsAppReadiness } from './whatsapp-readiness'

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
  const companySearch = typeof sp.companySearch === 'string' ? sp.companySearch.trim().slice(0, 100) : ''

  const svc = requireServiceClient()
  const companyQuery = svc.from('companies').select('id, name').order('name').limit(30)
  if (companySearch) companyQuery.ilike('name', `%${companySearch}%`)

  const [companies, selectedCompany, configResult, senderResult, templates, metaConfig, displayNumber, welcomeConfig] = await Promise.all([
    companyQuery,
    filters.companyId ? svc.from('companies').select('id, name').eq('id', filters.companyId).maybeSingle() : null,
    filters.companyId ? svc
      .from('whatsapp_company_configs')
      .select('id, company_id, status, delivery_format, review_reason, welcome_sending_step, welcome_recipient_phone')
      .eq('company_id', filters.companyId) : null,
    filters.companyId ? svc
      .from('whatsapp_authorized_senders')
      .select('id, company_id, phone_e164, user_id, status, created_by_admin, admin_phone_only, verified_at, welcome_template_claim_until, welcome_template_needs_review')
      .eq('company_id', filters.companyId) : null,
    listTemplates(),
    getWhatsAppPlatformConfig(),
    getWhatsAppDisplayNumber(),
    getWhatsAppWelcomeConfig(),
  ])
  const companyOptions = companies.data ?? []
  if (selectedCompany?.data && !companyOptions.some((c) => c.id === selectedCompany.data?.id)) {
    companyOptions.unshift(selectedCompany.data)
  }
  const accountsError = companies.error || selectedCompany?.error || configResult?.error || senderResult?.error
  const readiness = getWhatsAppReadiness({
    metaAccessConfigured: Boolean(metaConfig.accessToken),
    metaPhoneConfigured: Boolean(metaConfig.phoneNumberId),
    metaBusinessConfigured: Boolean(metaConfig.wabaId),
    displayNumber,
    welcomeTemplateNames: welcomeConfig.templateNames,
    templates,
  })

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

      <Tabs key={initialTab} defaultValue={initialTab} className="w-full gap-5">
        <div className="border-b border-[var(--glass-border)] bg-[var(--glass-bg-light)]">
          <TabsList variant="line" className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start">
            <TabsTrigger value="accounts" className={TAB_TRIGGER_CLASSES}>
              <T>Accounts</T>
            </TabsTrigger>
            <TabsTrigger value="templates" className={TAB_TRIGGER_CLASSES}>
              <T>Templates</T>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="accounts" className="mt-0 space-y-4">
          <form action="/admin/inbox/settings" className="flex max-w-md gap-2">
            <Input name="companySearch" aria-label="Company name" defaultValue={companySearch} placeholder="Find a company by name" />
            <Button type="submit" variant="outline"><T>Search</T></Button>
          </form>
          {accountsError ? (
            <p role="alert" className="text-sm text-destructive"><T>Could not load WhatsApp accounts.</T></p>
          ) : (
            <AdminWhatsAppAccounts
              key={selectedCompany?.data?.id ?? 'no-company'}
              companies={companyOptions}
              configs={(configResult?.data ?? []).map(({ welcome_recipient_phone, ...config }) => ({
                ...config,
                welcomePhoneLast4: welcome_recipient_phone?.slice(-4) ?? null,
              }))}
              senders={(senderResult?.data ?? []).map(({ phone_e164, user_id, admin_phone_only, ...sender }) => ({
                ...sender,
                maskedPhone: `···${phone_e164.slice(-4)}`,
                linkedAccountLabel: user_id ? `${user_id.slice(0, 8)}…` : null,
                needsPhoneOnlyConfirmation: !user_id && sender.created_by_admin === true && !admin_phone_only,
              }))}
              companyId={selectedCompany?.data?.id}
              companySearch={companySearch}
            />
          )}
        </TabsContent>
        <TabsContent value="templates" className="mt-0 space-y-6">
          <WhatsAppReadiness readiness={readiness} />
          <WhatsAppTemplatesPanel templates={templates} metaConfigured={Boolean(metaConfig.accessToken && metaConfig.wabaId)} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
