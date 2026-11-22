'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  CONSENT_OPEN_EVENT,
  pushConsentUpdate,
  readStoredConsent,
  storeConsent,
  type ConsentChoice,
} from '@/lib/marketing/consent'

/**
 * Compact consent bar: bottom-anchored on phones, a small card at the bottom
 * left on desktop. One tap on Accept or Reject closes it. Reopened by the
 * "Cookie settings" footer links through the CONSENT_OPEN_EVENT window event.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(false)
  const acceptRef = useRef<HTMLButtonElement>(null)
  const reopened = useRef(false)

  useEffect(() => {
    if (readStoredConsent() === null) setOpen(true)
    function reopen() {
      reopened.current = true
      setOpen(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, reopen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen)
  }, [])

  useEffect(() => {
    // Keyboard users who ask for the settings land on the first button.
    if (open && reopened.current) acceptRef.current?.focus()
  }, [open])

  const choose = useCallback((choice: ConsentChoice) => {
    storeConsent(choice)
    pushConsentUpdate(choice)
    reopened.current = false
    setOpen(false)
  }, [])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="xt-consent-title"
      aria-describedby="xt-consent-text"
      data-testid="cookie-consent"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom,_0px))] text-card-foreground shadow-lg sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[22rem] sm:rounded-[var(--radius-lg)] sm:border sm:p-4"
    >
      <p id="xt-consent-title" className="sr-only">
        Cookie preferences
      </p>
      <p id="xt-consent-text" className="text-[13px] leading-snug text-muted-foreground sm:text-sm">
        We use cookies to understand how people use our site and to measure our ads.{' '}
        <Link href="/privacy-policy" className="text-foreground underline underline-offset-2">
          Learn more
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <Button ref={acceptRef} type="button" size="sm" className="flex-1" onClick={() => choose('accepted')}>
          Accept
        </Button>
        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => choose('rejected')}>
          Reject
        </Button>
      </div>
    </div>
  )
}
