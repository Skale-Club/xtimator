'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { BILLING_SETTINGS_PATH } from '@/lib/billing/block-codes'
import { useIsTwa } from '@/components/pwa/twa-provider'
import { TWA_OUT_OF_CREDITS_COPY } from '@/lib/pwa/twa-signal'
import { cn } from '@/lib/utils'
import { useBillingState } from './billing-state-context'

/**
 * A paywalled free account is read-only on the server (billingEditDenied on
 * every business write). Product rule 2026-11-20: a write either works
 * everywhere or nowhere, so a screen whose writes the server refuses must not
 * look editable. True while the company is paywalled; an out-of-credits Pro
 * account can still edit, as the server allows.
 */
export function usePaywallReadOnly(): boolean {
  return useBillingState() === 'paywalled'
}

/** One line that says why the controls below are off, with the way out. */
export function PaywallReadOnlyNotice({ className }: { className?: string }) {
  const { t } = useTranslation()
  const isTwa = useIsTwa()
  return (
    <div
      role="status"
      data-testid="paywall-read-only-notice"
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-3.5 py-2.5 text-sm',
        className
      )}
    >
      <Lock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 leading-snug text-foreground">
        {isTwa ? t(TWA_OUT_OF_CREDITS_COPY) : t('Your free credits are used up. Subscribe to make changes.')}
      </p>
      {!isTwa && (
        <Link
          href={`${BILLING_SETTINGS_PATH}#choose-plan`}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('Subscribe')}
        </Link>
      )}
    </div>
  )
}

/**
 * Wraps a screen whose writes the server refuses while paywalled: the notice on
 * top and every control below disabled through a native disabled fieldset
 * (inputs, buttons, selects, Radix triggers). Links keep working, so the person
 * can still read and move around. Renders the children untouched otherwise.
 */
export function PaywallReadOnly({
  children,
  enabled = true,
  noticeClassName,
}: {
  children: ReactNode
  /** False leaves the screen editable (a route that stays open while paywalled). */
  enabled?: boolean
  noticeClassName?: string
}) {
  const readOnly = usePaywallReadOnly()
  if (!readOnly || !enabled) return <>{children}</>
  return (
    <>
      <PaywallReadOnlyNotice className={cn('mb-6', noticeClassName)} />
      <fieldset disabled data-paywall-read-only="" className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </>
  )
}
