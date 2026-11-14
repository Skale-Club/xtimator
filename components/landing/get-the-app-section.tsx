'use client'

import { Smartphone } from 'lucide-react'
import { GooglePlayBadge, useStoreBadgeVisible } from '@/components/landing/google-play-badge'

/**
 * Landing band for the Android app, kept apart from the sign-up CTAs. The whole
 * section disappears inside the Android app itself (TWA) and on iOS, where
 * there is no app to install.
 */
export function GetTheAppSection({ initialVisible = true }: { initialVisible?: boolean }) {
  const visible = useStoreBadgeVisible(initialVisible)
  if (!visible) return null

  return (
    <section aria-labelledby="get-the-app-heading" className="border-b border-white/5 bg-transparent py-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="flex flex-col items-center gap-8 text-center md:flex-row md:justify-between md:text-left">
          <div className="flex flex-col items-center gap-5 md:flex-row md:items-start">
            <div aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-primary">
              <Smartphone className="size-7" />
            </div>
            <div className="max-w-xl space-y-2 sm:space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary sm:text-sm">Android app</p>
              <h2 id="get-the-app-heading" className="text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
                Your estimates, in your pocket
              </h2>
              <p className="text-[17px] leading-relaxed text-muted-foreground sm:text-base">
                Record the walkthrough, snap photos and send the estimate from the job site. Same account as the
                web, so you pick up right where you left off.
              </p>
            </div>
          </div>
          <GooglePlayBadge placement="app_section" initialVisible className="h-[72px] md:h-20" />
        </div>
      </div>
    </section>
  )
}
