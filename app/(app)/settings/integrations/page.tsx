import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CreditCard, Plug, ChevronRight } from 'lucide-react'

import { T } from '@/components/i18n/t'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { requireServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Integrations | Settings' }

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  )
}

export default async function SettingsIntegrationsPage() {
  const companyId = await getActiveCompanyId()
  if (isDemoCompany(companyId)) redirect('/settings/company')

  const claims = await getAuthClaims()

  let stripeConnected = false
  if (claims) {
    const svc = requireServiceClient()
    const { data: company } = await svc
      .from('companies')
      .select('stripe_account_id, stripe_connect_status')
      .eq('user_id', claims.sub as string)
      .single()
    stripeConnected =
      !!company?.stripe_account_id && company.stripe_connect_status === 'active'
  }

  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Integrations</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Connect the tools your business runs on.</T>
        </p>
      </header>

      {/* Collect payments — Stripe Connect setup. */}
      <section className="space-y-3">
        <SectionHeading>
          <T>Collect payments</T>
        </SectionHeading>
        <Link
          href="/settings/integrations/stripe"
          className="group block focus:outline-none"
        >
          <Card className="transition hover:border-primary/40 hover:shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-ring">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" aria-hidden />
                  <CardTitle className="text-base">Stripe</CardTitle>
                  <Badge variant={stripeConnected ? 'default' : 'secondary'}>
                    {stripeConnected ? 'Connected' : 'Not connected'}
                  </Badge>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
              <CardDescription>
                <T>Let customers pay estimates online via Stripe Connect.</T>
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </section>

      {/* Developer tools — use Xtimator from inside AI clients via MCP. */}
      <section className="space-y-3">
        <SectionHeading>
          <T>Developer tools</T>
        </SectionHeading>
        <Link
          href="/settings/integrations/mcp"
          className="group block focus:outline-none"
        >
          <Card className="transition hover:border-primary/40 hover:shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-ring">
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
      </section>
    </div>
  )
}
