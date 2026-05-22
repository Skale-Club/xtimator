'use client'

import { useEffect } from 'react'

export function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
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
