'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  enableBrowserPush,
  getDeviceSubscription,
  isPushSupported,
  needsHomeScreenInstall,
  prefetchPushPublicKey,
  syncDeviceSubscription,
  type EnableResult,
  type PushLanguage,
} from '@/lib/notifications/push-client'

/**
 * What the "notify me on this device" control should show:
 *  - hidden:      nothing to offer (unsupported, blocked, push not configured);
 *  - available:   one tap subscribes this device;
 *  - enabled:     this device already gets notified;
 *  - ios_install: iPhone/iPad in a Safari tab, where Web Push only exists for
 *                 a web app added to the Home Screen.
 */
export type PushOptInStatus = 'loading' | 'hidden' | 'available' | 'enabled' | 'ios_install'

export function usePushOptIn(lang: PushLanguage): {
  status: PushOptInStatus
  busy: boolean
  enable: () => Promise<EnableResult>
} {
  const [status, setStatus] = useState<PushOptInStatus>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const settle = (s: PushOptInStatus) => {
      if (!cancelled) setStatus(s)
    }
    void (async () => {
      if (needsHomeScreenInstall()) return settle('ios_install')
      if (!isPushSupported()) return settle('hidden')
      if (Notification.permission === 'denied') return settle('hidden')
      const key = await prefetchPushPublicKey()
      if (!key) return settle('hidden')
      const sub = await getDeviceSubscription()
      if (sub) {
        void syncDeviceSubscription(lang)
        return settle('enabled')
      }
      settle('available')
    })()
    return () => {
      cancelled = true
    }
  }, [lang])

  // Call from the click itself: enableBrowserPush asks for permission as its
  // first await, which Safari only grants inside the user's gesture.
  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const result = await enableBrowserPush(lang)
      if (result.ok) setStatus('enabled')
      else if (result.reason !== 'error') setStatus('hidden')
      return result
    } finally {
      setBusy(false)
    }
  }, [lang])

  return { status, busy, enable }
}
