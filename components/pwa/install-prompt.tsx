'use client'

import { useEffect, useState } from 'react'
import { X, Download, Share } from 'lucide-react'
import { useInstallApp } from './use-install-app'

const DISMISS_KEY = 'pwa_install_dismissed'

interface Props {
  hasProjects?: boolean
}

export function InstallPrompt({ hasProjects = false }: Props) {
  // The beforeinstallprompt event is shared with the avatar-menu "Install app"
  // item — both read it from the same store (it can only be prompted once).
  const { platform, installed, canPrompt, promptInstall } = useInstallApp()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(Boolean(localStorage.getItem(DISMISS_KEY)))
  }, [])

  // Gate: only show after user has at least one project
  if (!hasProjects || !platform || installed || dismissed) return null
  const isIOS = platform === 'ios'
  // beforeinstallprompt never fires on iOS — it gets static instructions instead
  if (!isIOS && !canPrompt) return null

  async function handleInstall() {
    await promptInstall()
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,_0px)_+_5rem)] left-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl sm:left-auto sm:right-4 sm:max-w-sm lg:bottom-4">
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
