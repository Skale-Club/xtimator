'use client'

import type { ReactNode } from 'react'
import { SettingsNav, SettingsNavStrip } from './settings-nav'

/**
 * Settings shell.
 *
 * - md+: a fixed-width grouped rail on the left, sticky so it stays put while
 *   the page scrolls (its containing block is the min-h-full container in
 *   app/(app)/settings/layout.tsx, which grows with the content). Its height
 *   leaves out main's md:pb-6 too (4rem top bar + 1.5rem): that padding sits
 *   outside the containing block, so a full-height rail got nudged up 24px at
 *   the very end of the scroll.
 * - Below md: no rail. A single row of pills, pinned under the top bar, so the
 *   page keeps the whole phone width.
 *
 * The content column owns the page padding and the reading width, so no page
 * adds its own `p-6` or max-width.
 */
export function SettingsLayoutClient({ children, isDemo }: { children: ReactNode; isDemo?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row md:items-start">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur md:hidden">
        <SettingsNavStrip isDemo={isDemo} />
      </div>

      <aside className="sticky top-0 hidden h-[calc(100dvh-5.5rem)] w-56 shrink-0 self-start overflow-y-auto scrollbar-none border-r border-border px-3 py-8 md:block">
        <SettingsNav isDemo={isDemo} />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
