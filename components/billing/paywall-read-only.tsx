'use client'

import type { ReactNode } from 'react'
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

/**
 * Wraps a screen whose writes the server refuses while paywalled: every control
 * below is disabled through a native disabled fieldset (inputs, buttons,
 * selects, Radix triggers). Links keep working, so the person can still read and
 * move around. No notice here: the app-wide paywall banner already says why.
 * Renders the children untouched otherwise.
 */
export function PaywallReadOnly({
  children,
  enabled = true,
}: {
  children: ReactNode
  /** False leaves the screen editable (a route that stays open while paywalled). */
  enabled?: boolean
}) {
  const readOnly = usePaywallReadOnly()
  if (!readOnly || !enabled) return <>{children}</>
  return (
    <fieldset disabled data-paywall-read-only="" className="m-0 min-w-0 border-0 p-0">
      {children}
    </fieldset>
  )
}
