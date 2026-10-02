'use client'

import { useEffect } from 'react'
import { isPushWorkerRegistration } from '@/lib/pwa/push-worker'

export function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV === 'production') {
      // Emergency PWA rollback: remove existing workers that can interfere
      // with production assets. Keep this until the PWA cache strategy is rebuilt.
      // 260928: spare the push-only worker (no fetch handler, controls no page),
      // or every push subscription would die on the next load.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.filter((r) => !isPushWorkerRegistration(r)).map((r) => r.unregister())))
        .catch(() => {})

      if (typeof caches !== 'undefined') {
        caches.keys()
          .then((keys) => Promise.all(
            keys
              .filter((k) => k.startsWith('shell-') || k.startsWith('pages-'))
              .map((k) => caches.delete(k))
          ))
          .catch(() => {})
      }

      return
    }

    // Dev cleanup: rescue browsers that already registered the SW in dev.
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.filter((r) => !isPushWorkerRegistration(r)).map((r) => r.unregister())))
      .catch(() => {})

    if (typeof caches !== 'undefined') {
      caches.keys()
        .then((keys) => Promise.all(
          keys
            .filter((k) => k.startsWith('shell-') || k.startsWith('pages-'))
            .map((k) => caches.delete(k))
        ))
        .catch(() => {})
    }
  }, [])
  return null
}
