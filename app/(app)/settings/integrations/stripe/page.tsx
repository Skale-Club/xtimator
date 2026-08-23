import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { isDemoCompany } from '@/lib/demo/config'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import {
  StripeConnectCard,
  type ConnectState,
} from '@/components/settings/stripe-connect-card'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Stripe | Settings' }

export default async function StripeIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  // Fix 3: resolve the ACTIVE company (multi-company-safe) instead of
  // `.eq('user_id', claims.sub).single()`. The old lookup broke for a
  // multi-company owner (2+ rows → PostgREST error on `.single()` → redirect
  // to /onboarding) and, for a non-owner member (whose user_id never matches
  // `companies.user_id`), would also fail to resolve — or, worse, could
  // show/disconnect the WRONG company if a future schema changed that
  // assumption. `getActiveCompanyId()` is the same active-company resolver
  // every other billing route now uses.
  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) redirect('/onboarding')

  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select(
      'id, stripe_account_id, stripe_connect_status, stripe_account_email, stripe_account_display_name, stripe_charges_enabled, stripe_connect_disabled_reason'
    )
    .eq('id', activeCompanyId)
    .single()
  if (!company) redirect('/onboarding')
  if (isDemoCompany(company.id)) redirect('/settings/company')

  const clientId = await getIntegrationKey('stripe_connect_client_id')

  let state: ConnectState
  if (!clientId) {
    state = { kind: 'not_configured' }
  } else if (
    company.stripe_account_id &&
    company.stripe_connect_status === 'active'
  ) {
    state = {
      kind: 'connected',
      displayName:
        (company.stripe_account_display_name as string | null) ??
        (company.stripe_account_id as string),
      email: (company.stripe_account_email as string | null) ?? null,
    }
  } else if (
    // CONNECT-HEALTH-01: Stripe restricted a previously-connected account
    // (failed verification, a rejected review, a paused capability, ...).
    // The account is still linked (stripe_account_id present) but cannot
    // currently be paid — surface that distinctly from "never connected".
    company.stripe_account_id &&
    company.stripe_connect_status === 'restricted'
  ) {
    state = {
      kind: 'restricted',
      displayName:
        (company.stripe_account_display_name as string | null) ??
        (company.stripe_account_id as string),
      email: (company.stripe_account_email as string | null) ?? null,
      disabledReason:
        (company.stripe_connect_disabled_reason as string | null) ?? null,
    }
  } else {
    state = { kind: 'not_connected' }
  }

  const { estimateFeePct } = await getBillingConfig()

  const sp = await searchParams
  const toastError = sp.error
  const toastConnected = sp.connected === '1'

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Stripe</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Connect Stripe to let customers pay estimates online.</T>
        </p>
      </header>
      {toastConnected && (
        <Card
          variant="glass"
          className="border-l-[3px] border-l-emerald-500 p-4 text-sm"
        >
          <T>Stripe account connected successfully.</T>
        </Card>
      )}
      {toastError && (
        <Card
          variant="glass"
          className="border-l-[3px] border-l-[hsl(var(--destructive))] p-4 text-sm text-destructive"
        >
          {toastError === 'platform_not_configured'
            ? <T>Stripe Connect is not yet enabled on the platform.</T>
            : <T text={`Connection failed: ${toastError}`} />}
        </Card>
      )}
      <StripeConnectCard state={state} feePct={estimateFeePct} />
    </div>
  )
}
