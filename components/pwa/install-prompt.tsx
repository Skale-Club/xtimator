'use client'

import { useEffect, useState } from 'react'
import { X, Download, Share } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa_install_dismissed'

interface Props {
  hasProjects?: boolean
}

export function InstallPrompt({ hasProjects = false }: Props) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Gate: only show after user has at least one project
    if (!hasProjects) return
    // Already installed (standalone mode) — never show
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // Previously dismissed — don't show again
    if (localStorage.getItem(DISMISS_KEY)) return

    // Detect iOS Safari (beforeinstallprompt never fires on iOS)
    const ua = navigator.userAgent
    const ios = /iPhone|iPad/i.test(ua)
    setIsIOS(ios)

    if (ios) {
      // On iOS, show static instructions immediately
      setVisible(true)
      return
    }

    // Android Chrome / desktop: wait for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [hasProjects])

  if (!visible) return null
  // Android: also need the prompt captured before rendering
  if (!isIOS && !prompt) return null

  async function handleInstall() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setVisible(false)
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,_0px)_+_5rem)] left-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl sm:left-auto sm:right-4 sm:max-w-sm md:bottom-4">
      {isIOS ? (
        <Share className="h-5 w-5 shrink-0 text-primary" />
      ) : (
        <Download className="h-5 w-5 shrink-0 text-primary" />
      )}
      <p className="flex-1 text-sm text-foreground">
        {isIOS
          ? 'Tap Share then "Add to Home Screen" to install'
          : 'Install Xtimator for quick access'}
      </p>
      {!isIOS && (
        <button
          onClick={handleInstall}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Install
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
