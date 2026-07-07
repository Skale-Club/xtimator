'use client'

import { useEffect } from 'react'

export function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV === 'production') {
      // Emergency PWA rollback: remove existing workers that can interfere
      // with production assets. Keep this until the PWA cache strategy is rebuilt.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
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
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
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
