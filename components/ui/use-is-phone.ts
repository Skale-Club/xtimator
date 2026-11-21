'use client'

import { useSyncExternalStore } from 'react'

// Same breakpoint as components/ui/bottom-sheet.tsx (< sm = phone).
const PHONE_QUERY = '(max-width: 639px)'

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const list = window.matchMedia(PHONE_QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

function getSnapshot() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(PHONE_QUERY).matches
    : false
}

/** True below 640px, where overlays open as the shared bottom sheet (components/ui/bottom-sheet.tsx). SSR-safe (false on the server). */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
