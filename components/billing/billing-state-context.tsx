'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { BillingWallCode } from '@/lib/billing/block-codes'

export type BillingState = 'active' | BillingWallCode

const BillingStateContext = createContext<BillingState>('active')

/**
 * The company's credit access state, resolved once by the (app) layout (the
 * same value that drives the paywall banner) and read by client surfaces that
 * must not offer what the server will refuse. QA 2026-11-19: a paywalled free
 * account could type into the estimate editor, every save failed ("Not saved")
 * and the edits were lost.
 */
export function BillingStateProvider({ state, children }: { state: BillingState; children: ReactNode }) {
  return <BillingStateContext.Provider value={state}>{children}</BillingStateContext.Provider>
}

/** 'active' outside the provider (tests, public pages): never blocks by itself. */
export function useBillingState(): BillingState {
  return useContext(BillingStateContext)
}
