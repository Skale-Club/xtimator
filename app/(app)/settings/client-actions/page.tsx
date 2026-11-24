import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { isDemoCompany } from '@/lib/demo/config'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { COMPANY_FEATURE_COLUMNS, resolveCompanyFeatures } from '@/lib/features/company-features'
import { getPlatformFeatureState } from '@/lib/features/platform-feature-state'
import type { ConnectState } from '@/components/settings/stripe-connect-card'
import { ClientActionsPanel } from '@/components/settings/client-actions-panel'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Client actions | Settings' }

/** Friendly text for the error codes the Stripe connect routes send back. */
const ERROR_TEXT: Record<string, string> = {
  owner_required: 'Only the company owner can connect Stripe.',
  platform_not_configured: 'Stripe Connect is not yet enabled on the platform.',
  payments_not_available: 'Online payments are not available for your account.',
  payments_off: 'Turn on Pay online first, then connect Stripe.',
  invalid_state: 'The connection attempt expired. Please try again.',
  missing_params: 'Stripe did not send back everything we need. Please try again.',
  token_exchange_failed: 'Stripe could not confirm the connection. Please try again.',
  insufficient_scope: 'Stripe did not grant the access Xtimator needs. Please try connecting again.',
  mode_mismatch:
    'That Stripe account is in a different mode (test or live) than this platform. Use an account in the right mode.',
  account_in_use: 'That Stripe account is already connected to another company in Xtimator.',
  save_failed: 'We could not save the Stripe connection. Please try again.',
}

export default async function ClientActionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  // Active-company resolver (multi-company safe), same as every billing route.
  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) redirect('/onboarding')

  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select(
      `id, ${COMPANY_FEATURE_COLUMNS}, stripe_account_email, stripe_account_display_name, stripe_connect_disabled_reason`,
    )
    .eq('id', activeCompanyId)
    .single()
  if (!company) redirect('/onboarding')
  if (isDemoCompany(company.id)) redirect('/settings/company')

  const features = resolveCompanyFeatures(company, await getPlatformFeatureState())
  const { onlinePayments, digitalSignature } = features

  let isOwner = false
  try {
    await requireCompanyOwner(company.id)
    isOwner = true
  } catch {
    isOwner = false
  }

  const clientId = await getIntegrationKey('stripe_connect_client_id')
  const displayName =
    (company.stripe_account_display_name as string | null) ??
    (company.stripe_account_id as string | null) ??
    ''
  const email = (company.stripe_account_email as string | null) ?? null

  let connectState: ConnectState
  if ((!clientId || !/^ca_[A-Za-z0-9]+$/.test(clientId)) && !onlinePayments.linked) {
    connectState = { kind: 'not_configured' }
  } else if (onlinePayments.healthy) {
    connectState = { kind: 'connected', displayName, email }
  } else if (onlinePayments.restricted) {
    connectState = {
      kind: 'restricted',
      displayName,
      email,
      disabledReason: (company.stripe_connect_disabled_reason as string | null) ?? null,
    }
  } else {
    connectState = { kind: 'not_connected' }
  }

  // Invoices still open when the owner disconnects can no longer be tracked.
  let openInvoiceCount = 0
  if (onlinePayments.linked) {
    const { count } = await svc
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id as string)
      .eq('status', 'open')
    openInvoiceCount = count ?? 0
  }

  const { estimateFeePct } = await getBillingConfig()

  const sp = await searchParams
  const errorCode = sp.error
  // Only confirm a connection that really exists (the query string is user input).
  const connected = sp.connected === '1' && onlinePayments.linked

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>Client actions</T>}
        description={<T>Choose what your client can do on the estimate link.</T>}
      />
      {connected && (
        <Card variant="glass" className="border-l-[3px] border-l-emerald-500 p-4 text-sm">
          <T>Stripe account connected successfully.</T>
        </Card>
      )}
      {errorCode && (
        <Card
          variant="glass"
          className="border-l-[3px] border-l-[hsl(var(--destructive))] p-4 text-sm text-destructive"
        >
          {ERROR_TEXT[errorCode] ? (
            <T text={ERROR_TEXT[errorCode]} />
          ) : (
            <T text={`Connection failed: ${errorCode}`} />
          )}
        </Card>
      )}
      <ClientActionsPanel
        signature={{ showInSettings: digitalSignature.showInSettings, enabled: digitalSignature.enabled }}
        payments={{
          showInSettings: onlinePayments.showInSettings,
          allowed: onlinePayments.allowed,
          enabled: onlinePayments.enabled,
          linked: onlinePayments.linked,
        }}
        connectState={connectState}
        feePct={estimateFeePct}
        openInvoiceCount={openInvoiceCount}
        isOwner={isOwner}
      />
    </div>
  )
}
