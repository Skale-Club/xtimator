'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { CookieConsent } from '@/components/marketing/cookie-consent'
import {
  buildGtmBootstrapScript,
  readStoredConsent,
  resumeMarketingTags,
  suspendMarketingTags,
  writeConsentCookie,
} from '@/lib/marketing/consent'
import { captureAttribution } from '@/lib/marketing/attribution'
import { ctaFromClickTarget, trackCta } from '@/lib/marketing/events'
import { MARKETING_GTM_ID, isMarketingPath, isTwaClient } from '@/lib/marketing/tags'

/** One capture per page load (module state survives client-side navigation). */
let attributionCaptured = false

/**
 * Loads Google Tag Manager (GA4, Meta Pixel, Clarity live inside the container)
 * and shows the cookie banner, on public marketing pages only. Mounted by the
 * marketing surfaces (landing, site shell, blog and industries layouts), never by
 * the root layout. Renders nothing in the Android app (TWA) or off the allowlist.
 */
export function MarketingTags() {
  const pathname = usePathname()
  // Decided after mount: the TWA signals (cookie, referrer) only exist in the browser.
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    setAllowed(!isTwaClient())
  }, [])

  const onMarketingPage = allowed && isMarketingPath(pathname)

  // Leaving the marketing pages without a full reload (this component unmounts,
  // or the path stops being a marketing page) must stop every tag that is already
  // in memory, so nothing reports from the signed-in app or a client page.
  useEffect(() => {
    if (!onMarketingPage) {
      suspendMarketingTags()
      return
    }
    resumeMarketingTags()
    return () => suspendMarketingTags()
  }, [onMarketingPage])

  // Signup attribution (first-party cookie, read at onboarding) and the consent
  // cookie the server reads. Once per page load: a client-side navigation keeps
  // the original document.referrer, so re-capturing would invent touches.
  useEffect(() => {
    if (!onMarketingPage || attributionCaptured) return
    attributionCaptured = true
    const stored = readStoredConsent()
    if (stored) writeConsentCookie(stored)
    captureAttribution({ keepClickIds: stored !== 'rejected' })
  }, [onMarketingPage])

  // Clicks on elements marked data-xt-cta become Tag Manager events.
  useEffect(() => {
    if (!onMarketingPage) return
    function onClick(event: MouseEvent) {
      const hit = ctaFromClickTarget(event.target)
      if (hit) trackCta(hit.cta, hit.placement)
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [onMarketingPage])

  if (!onMarketingPage) return null

  return (
    <>
      <Script
        id="xt-gtm"
        strategy="afterInteractive"
        data-gtm-id={MARKETING_GTM_ID}
        dangerouslySetInnerHTML={{ __html: buildGtmBootstrapScript(MARKETING_GTM_ID) }}
      />
      <CookieConsent />
    </>
  )
}
