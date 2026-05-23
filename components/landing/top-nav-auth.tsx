'use client'

import { useState } from 'react'
import { AuthDialog } from '@/components/landing/auth-dialog'

interface TopNavAuthProps {
  branding: { appName: string; logoUrl: string | null }
  onOpenAuth?: (mode: 'login' | 'signup') => void
}

export function TopNavAuth({ branding, onOpenAuth }: TopNavAuthProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  function openLogin() {
    if (onOpenAuth) { onOpenAuth('login'); return }
    setMode('login')
    setOpen(true)
  }

  function openSignup() {
    if (onOpenAuth) { onOpenAuth('signup'); return }
    setMode('signup')
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={openSignup}
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.3)] transition-colors hover:bg-primary/90"
      >
        Start
      </button>

      <AuthDialog
        branding={branding}
        open={open}
        onClose={() => setOpen(false)}
        initialMode={mode}
      />
    </>
  )
}
