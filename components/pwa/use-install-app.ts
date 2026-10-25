'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPlatform = 'ios' | 'android' | 'desktop'

/**
 * Module-level store for the `beforeinstallprompt` event. Chrome fires it once,
 * early in the page's life — usually before any menu is opened — so it is
 * captured here at import time and shared by every install entry point (the
 * avatar menu item and the banner). `prompt()` can only be called once per
 * event, which is why it lives in one place instead of per component.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null
let installedThisSession = false
let snapshot = { canPrompt: false, installedThisSession: false }
const listeners = new Set<() => void>()

function emit() {
  snapshot = { canPrompt: deferredPrompt !== null, installedThisSession }
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installedThisSession = true
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const serverSnapshot = { canPrompt: false, installedThisSession: false }

export function detectInstallPlatform(ua: string, maxTouchPoints = 0): InstallPlatform {
  // iPadOS 13+ reports a desktop Mac user agent; touch support gives it away.
  const iPadOS = /Macintosh/.test(ua) && maxTouchPoints > 1
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function useInstallApp() {
  const store = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot)
  // Platform + standalone are read after mount so SSR and hydration agree.
  const [env, setEnv] = useState<{ platform: InstallPlatform; standalone: boolean } | null>(null)

  useEffect(() => {
    setEnv({
      platform: detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints),
      standalone: isStandalone(),
    })
  }, [])

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = deferredPrompt
    if (!event) return 'unavailable'
    await event.prompt()
    const { outcome } = await event.userChoice
    deferredPrompt = null
    if (outcome === 'accepted') installedThisSession = true
    emit()
    return outcome
  }

  return {
    /** null until mounted on the client. */
    platform: env?.platform ?? null,
    installed: (env?.standalone ?? false) || store.installedThisSession,
    canPrompt: store.canPrompt,
    promptInstall,
  }
}
