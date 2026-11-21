'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { SettingsCard, SettingsRow, SettingsRows } from '@/components/settings/settings-ui'
import { StripeConnectCard, type ConnectState } from '@/components/settings/stripe-connect-card'
import { setDigitalSignatureEnabled, setOnlinePaymentsEnabled } from '@/lib/actions/client-actions'
import { useTranslation } from '@/lib/i18n/use-translation'

export interface ClientActionsPanelProps {
  /** Resolver output: the signature row shows only when the platform allows it. */
  signature: { showInSettings: boolean; enabled: boolean }
  /** Resolver output: `allowed` gates the switch, `showInSettings` the whole section. */
  payments: { showInSettings: boolean; allowed: boolean; enabled: boolean; linked: boolean }
  connectState: ConnectState
  feePct: number
  /** Invoices still open: Disconnect asks for confirmation when above zero. */
  openInvoiceCount?: number
  /** Only the company owner may change the switches or connect/disconnect Stripe. */
  isOwner: boolean
}

export function ClientActionsPanel({
  signature,
  payments,
  connectState,
  feePct,
  openInvoiceCount = 0,
  isOwner,
}: ClientActionsPanelProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [signatureOn, setSignatureOn] = useState(signature.enabled)
  const [paymentsOn, setPaymentsOn] = useState(payments.enabled)

  function save(
    action: (enabled: boolean) => Promise<{ error: string } | { success: true }>,
    next: boolean,
    set: (v: boolean) => void,
    previous: boolean,
  ) {
    set(next)
    startTransition(async () => {
      const res = await action(next)
      if ('error' in res) {
        set(previous)
        toast.error(t(res.error))
        return
      }
      toast.success(t('Saved.'))
      router.refresh()
    })
  }

  const showCard = payments.showInSettings && (payments.linked || (payments.allowed && paymentsOn))

  return (
    <div className="space-y-6">
      <SettingsCard bodyClassName="py-4 sm:py-4">
        <SettingsRows>
          <SettingsRow
            label={t('View and download')}
            description={t('Your client can always open the estimate and download the PDF.')}
          >
            {null}
          </SettingsRow>

          {signature.showInSettings && (
            <SettingsRow
              htmlFor="client-action-signature"
              label={t('Approve and sign online')}
              description={t(
                'Your client can accept by signing on the link, or decline. When this is off you record the answer yourself in the app.',
              )}
            >
              <Switch
                id="client-action-signature"
                data-testid="client-action-signature"
                checked={signatureOn}
                disabled={!isOwner || isPending}
                onCheckedChange={(v) => save(setDigitalSignatureEnabled, v, setSignatureOn, signatureOn)}
              />
            </SettingsRow>
          )}

          {payments.showInSettings && payments.allowed && (
            <SettingsRow
              htmlFor="client-action-payments"
              label={t('Pay online')}
              description={t('Your client can pay the invoices you issue, by card, through Stripe.')}
            >
              <Switch
                id="client-action-payments"
                data-testid="client-action-payments"
                checked={paymentsOn}
                disabled={!isOwner || isPending}
                onCheckedChange={(v) => save(setOnlinePaymentsEnabled, v, setPaymentsOn, paymentsOn)}
              />
            </SettingsRow>
          )}

          {payments.showInSettings && !payments.allowed && (
            <SettingsRow label={t('Pay online')}>
              <span data-testid="payments-off-note" className="text-sm text-muted-foreground">
                {t('Online payments are turned off for your account.')}
              </span>
            </SettingsRow>
          )}
        </SettingsRows>
      </SettingsCard>

      {showCard && <StripeConnectCard state={connectState} feePct={feePct} openInvoiceCount={openInvoiceCount} readOnly={!isOwner} />}
    </div>
  )
}
