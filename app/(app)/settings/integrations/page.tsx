import Link from 'next/link'
import { Plug, ChevronRight } from 'lucide-react'

import { T } from '@/components/i18n/t'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import {
  WhatsAppConnectCard,
  type WhatsAppStatus,
} from '@/components/settings/whatsapp-connect-card'

export const metadata = { title: 'Integrations | Settings' }

export default async function SettingsIntegrationsPage() {
  const companyId = await getActiveCompanyId()

  // company_whatsapp is RLS deny-all → read via the service client, scoped to the
  // validated active company (the same company the connect actions write to).
  let initial: WhatsAppStatus = null
  const svc = createServiceClient()
  if (companyId && svc) {
    const { data: row } = await svc
      .from('company_whatsapp')
      .select('phone_number, phone_number_id, waba_id, status, delivery_format')
      .eq('company_id', companyId)
      .maybeSingle()

    if (row) {
      initial = {
        phoneNumber: row.phone_number as string,
        phoneNumberId: row.phone_number_id as string,
        wabaId: row.waba_id as string,
        status: row.status as string,
        deliveryFormat: row.delivery_format as
          | 'share_link'
          | 'formatted_text'
          | 'pdf_attachment',
      }
    }
  }

  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Integrations</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Connect outbound channels and AI assistants.</T>
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Phase 90: MCP Server entry card */}
        <Link
          href="/settings/integrations/mcp"
          className="group block focus:outline-none"
        >
          <Card className="h-full transition hover:border-primary/40 hover:shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-ring">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Plug className="h-5 w-5 text-primary" aria-hidden />
                  <CardTitle className="text-base">MCP Server</CardTitle>
                  <Badge variant="secondary">Beta</Badge>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
              <CardDescription>
                Use Xtimator from inside Claude, Claude Code, or ChatGPT.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              6 tools available · OAuth 2.0 · per-company scope
            </CardContent>
          </Card>
        </Link>
      </div>

      <section className="space-y-4">
        <WhatsAppConnectCard initial={initial} />
      </section>
    </div>
  )
}
