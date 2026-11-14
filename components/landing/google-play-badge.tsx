'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { readTwaCookieClient } from '@/lib/pwa/twa-signal'
import { googlePlayUrl, isAppleMobileDevice, type StoreBadgePlacement } from '@/lib/store-links'

/**
 * Whether store promotion should show: false inside the Android app (TWA) and
 * on iOS. Starts from the server's decision and re-checks after mount.
 */
export function useStoreBadgeVisible(initialVisible = true): boolean {
  const [visible, setVisible] = useState(initialVisible)
  useEffect(() => {
    if (readTwaCookieClient() || isAppleMobileDevice(navigator.userAgent, navigator.maxTouchPoints)) {
      setVisible(false)
    }
  }, [])
  return visible
}

interface GooglePlayBadgeProps {
  placement: StoreBadgePlacement
  /**
   * Server-side decision (no TWA cookie, not an iPhone/iPad user agent). The
   * browser re-checks after mount, which also covers iPadOS reporting a Mac.
   */
  initialVisible?: boolean
  className?: string
}

/**
 * The official "Get it on Google Play" badge, linking to the store listing.
 * Hidden inside the Android app itself (TWA) and on iOS, where there is no app.
 *
 * The artwork is Google's unmodified badge (public/badges/google-play-en.png,
 * 646x250 with Google's own clear space built in). Google's brand rules forbid
 * recolouring or redrawing it, so size it by height only.
 */
export function GooglePlayBadge({ placement, initialVisible = true, className }: GooglePlayBadgeProps) {
  const visible = useStoreBadgeVisible(initialVisible)
  if (!visible) return null

  return (
    <a
      href={googlePlayUrl(placement)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Get it on Google Play"
      data-testid={`google-play-badge-${placement}`}
      className={cn(
        'inline-flex shrink-0 rounded-lg transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static 5 KB brand asset, no optimisation needed */}
      <img
        src="/badges/google-play-en.png"
        alt="Get it on Google Play"
        width={646}
        height={250}
        loading="lazy"
        decoding="async"
        className="h-full w-auto"
      />
    </a>
  )
}
