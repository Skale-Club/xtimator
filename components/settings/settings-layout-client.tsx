'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { PaywallReadOnly } from '@/components/billing/paywall-read-only'
import { SettingsNav, SettingsNavStrip } from './settings-nav'

/**
 * Settings that stay editable while the company is paywalled: the person's own
 * account, theme and alerts, and the billing page (the way out). Everything
 * else is the business's data, which the server refuses to change while
 * paywalled (rule 2026-11-20: works everywhere or nowhere), so those pages
 * render read-only.
 */
const OPEN_WHILE_PAYWALLED = ['/settings/account', '/settings/appearance', '/settings/notifications', '/settings/billing']

export function settingsOpenWhilePaywalled(pathname: string | null): boolean {
  if (!pathname || pathname === '/settings') return true
  return OPEN_WHILE_PAYWALLED.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Settings shell.
 *
 * - md+: a fixed-width grouped rail on the left, sticky so it stays put while
 *   the page scrolls (its containing block is the min-h-full container in
 *   app/(app)/settings/layout.tsx, which grows with the content). It is the
 *   full height under the 4rem top bar: that container cancels main's md:pb-6
 *   with md:-mb-6, so the rail's border reaches the bottom of the screen and
 *   the rail is not nudged up at the end of the scroll.
 * - Below md: no rail. A button pinned under the top bar names the section and
 *   opens the same grouped nav as a left drawer, so the page keeps the width.
 *
 * The content column owns the page padding and the reading width, so no page
 * adds its own `p-6` or max-width.
 */
export function SettingsLayoutClient({ children, isDemo }: { children: ReactNode; isDemo?: boolean }) {
  const pathname = usePathname()
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row md:items-start">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur md:hidden">
        <SettingsNavStrip isDemo={isDemo} />
      </div>

      <aside className="sticky top-0 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 self-start overflow-y-auto border-r border-border px-3 py-8 md:block">
        <SettingsNav isDemo={isDemo} />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
          <PaywallReadOnly enabled={!settingsOpenWhilePaywalled(pathname)}>{children}</PaywallReadOnly>
        </div>
      </div>
    </div>
  )
}
