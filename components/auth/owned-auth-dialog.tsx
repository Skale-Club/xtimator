'use client'

import { AppIcon } from '@/components/ui/app-icon'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PhoneSignIn } from './phone-sign-in'

export function OwnedAuthDialog({ branding, open, onClose, next }: {
  branding: { appName: string; logoUrl: string | null }; open: boolean; onClose: () => void; next?: string | null
}) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
    <DialogContent className="max-w-[400px]">
      <DialogTitle className="flex items-center gap-2 pb-3"><AppIcon appName={branding.appName} logoUrl={branding.logoUrl} className="size-7" />{branding.appName}</DialogTitle>
      <DialogDescription className="sr-only">Sign in or create an account with a text message code. Google sign-in is also available.</DialogDescription>
      {open ? <PhoneSignIn next={next} /> : null}
    </DialogContent>
  </Dialog>
}
