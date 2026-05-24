import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import {
  StripeConnectCard,
  type ConnectState,
} from '@/components/settings/stripe-connect-card'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

/**
 * /settings/payments — owner-facing page for the Stripe Connect lifecycle.
 *
 * Renders one of three states based on (a) platform Connect Client ID
 * presence and (b) the company's stripe_account_id + status. Shows toast
 * banners on `?connected=1` (success after OAuth return) and `?error=...`
 * (any failure code from initiate/callback).
 *
 * Phase 71-10: wrapped the StripeConnectCard surface in <Card variant="glass">
 * and turned status banners into glass cards with gradient-left accent.
 */
export default async function PaymentsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select(
      'id, stripe_account_id, stripe_connect_status, stripe_account_email, stripe_account_display_name'
    )
    .eq('user_id', claims.sub as string)
    .single()
  if (!company) redirect('/onboarding')

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
  } else {
    state = { kind: 'not_connected' }
  }

  const sp = await searchParams
  const toastError = sp.error
  const toastConnected = sp.connected === '1'

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Payments</T>
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
      <StripeConnectCard state={state} />
    </div>
  )
}
