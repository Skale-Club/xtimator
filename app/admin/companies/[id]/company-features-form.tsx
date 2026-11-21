'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { useTranslation } from '@/lib/i18n/use-translation'
import { setCompanyFeatureAllowed } from '../actions'

export type CompanyFeaturesState = {
  signature: {
    allowed: boolean
    enabled: boolean
    active: boolean
  }
  payments: {
    allowed: boolean
    enabled: boolean
    canIssue: boolean
    globalOpen: boolean
    stripe: 'not_connected' | 'connected' | 'restricted'
    stripeName: string | null
    disabledReason: string | null
    chargesEnabled: boolean | null
    openInvoices: number
    lastPaymentAt: string | null
  }
}

type Props = { companyId: string; state: CompanyFeaturesState }

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>{' '}
      <span className="font-mono">{value}</span>
    </div>
  )
}

export function CompanyFeaturesForm({ companyId, state }: Props) {
  const { t } = useTranslation()
  const [pending, startTransition] = useTransition()
  const [sigAllowed, setSigAllowed] = useState(state.signature.allowed)
  const [payAllowed, setPayAllowed] = useState(state.payments.allowed)
  const p = state.payments
  const on = t('on')
  const off = t('off')
  const yes = t('yes')
  const no = t('no')

  function toggle(feature: 'online_payments' | 'digital_signature', next: boolean) {
    const set = feature === 'online_payments' ? setPayAllowed : setSigAllowed
    const prev = feature === 'online_payments' ? payAllowed : sigAllowed
    set(next)
    startTransition(async () => {
      const result = await setCompanyFeatureAllowed(companyId, feature, next)
      if (result.ok) {
        toast.success(result.message ?? t('Saved'))
      } else {
        set(prev)
        toast.error(result.message)
      }
    })
  }

  const stripeLabel =
    p.stripe === 'connected'
      ? `${t('connected as')} ${p.stripeName ?? '—'}`
      : p.stripe === 'restricted'
        ? t('restricted')
        : t('not connected')
  const charges = p.chargesEnabled === null ? t('unknown') : p.chargesEnabled ? yes : no

  return (
    <div className="grid gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{t('Digital signature')}</span>
          <Switch
            checked={sigAllowed}
            onCheckedChange={(v) => toggle('digital_signature', v)}
            disabled={pending}
            aria-label={t('Allow digital signature')}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'Off makes the public link view-only for this company. Estimates already signed stay signed.'
          )}
        </p>
        <div className="rounded-md border bg-muted/20 px-4 py-3 text-xs space-y-1">
          <Row label={t('Tenant switch:')} value={state.signature.enabled ? on : off} />
          <Row
            label={t('Effective:')}
            value={state.signature.active ? t('active') : t('view-only')}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{t('Online payments')}</span>
          <Switch
            checked={payAllowed}
            onCheckedChange={(v) => toggle('online_payments', v)}
            disabled={pending}
            aria-label={t('Allow online payments')}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'Off hides the feature and blocks new invoices. Invoices already sent stay payable.'
          )}
        </p>
        {!p.globalOpen && (
          <p className="text-xs text-destructive">
            {t('Client payments are closed platform-wide (Integrations, Billing config).')}
          </p>
        )}
        <div className="rounded-md border bg-muted/20 px-4 py-3 text-xs space-y-1">
          <Row label={t('Tenant switch:')} value={p.enabled ? on : off} />
          <Row label={t('Stripe:')} value={stripeLabel} />
          {p.disabledReason && (
            <Row label={t('Disabled reason:')} value={p.disabledReason} />
          )}
          <Row label={t('Charges enabled:')} value={charges} />
          <Row label={t('Open invoices:')} value={String(p.openInvoices)} />
          <Row
            label={t('Last payment:')}
            value={p.lastPaymentAt ? p.lastPaymentAt.slice(0, 10) : '—'}
          />
          <Row label={t('Can issue invoices:')} value={p.canIssue ? yes : no} />
        </div>
      </div>
    </div>
  )
}
