import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import {
  StripeConnectCard,
  type ConnectState,
} from '@/components/settings/stripe-connect-card'

/**
 * /settings/payments — owner-facing page for the Stripe Connect lifecycle.
 *
 * Renders one of three states based on (a) platform Connect Client ID
 * presence and (b) the company's stripe_account_id + status. Shows toast
 * banners on `?connected=1` (success after OAuth return) and `?error=...`
 * (any failure code from initiate/callback).
 */
export default async function PaymentsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

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
    <div className="w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Connect Stripe to let customers pay estimates online.
        </p>
      </div>
      {toastConnected && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Stripe account connected successfully.
        </div>
      )}
      {toastError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {toastError === 'platform_not_configured'
            ? 'Stripe Connect is not yet enabled on the platform.'
            : `Connection failed: ${toastError}`}
        </div>
      )}
      <StripeConnectCard state={state} />
    </div>
  )
}
