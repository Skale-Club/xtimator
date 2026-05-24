'use client'

import { useState } from 'react'
import { AuthDialog } from '@/components/landing/auth-dialog'
import { Button } from '@/components/ui/button'

interface TopNavAuthProps {
  branding: { appName: string; logoUrl: string | null }
  onOpenAuth?: (mode: 'login' | 'signup') => void
}

export function TopNavAuth({ branding, onOpenAuth }: TopNavAuthProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  function openSignup() {
    if (onOpenAuth) { onOpenAuth('signup'); return }
    setMode('signup')
    setOpen(true)
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={openSignup} className="min-w-24">
        Start
      </Button>

      <AuthDialog
        branding={branding}
        open={open}
        onClose={() => setOpen(false)}
        initialMode={mode}
      />
    </>
  )
}
