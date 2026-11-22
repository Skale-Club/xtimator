'use client'

import { useEffect, useState } from 'react'
import { CONSENT_OPEN_EVENT } from '@/lib/marketing/consent'
import { isTwaClient } from '@/lib/marketing/tags'

/** Footer link that reopens the cookie banner. Hidden in the Android app, where no tags load. */
export function CookieSettingsLink({ className }: { className?: string }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(isTwaClient())
  }, [])

  if (hidden) return null

  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
    >
      Cookie settings
    </button>
  )
}
