'use client'

import Link from 'next/link'
import { AppIcon } from '@/components/ui/app-icon'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { VISIBLE_AREA_DIALOG } from '@/lib/visual-viewport'
import { cn } from '@/lib/utils'
import { PhoneSignIn } from './phone-sign-in'

/** The thin brand gradient across the top edge of the sign-in card, with a soft glow under it. */
export function GradientTopLine() {
  return <>
    <div aria-hidden className="pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary))_38%,#0BB8AF_68%,transparent)]" />
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-24 w-48 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
  </>
}

export function AuthBrand({ appName, logoUrl }: { appName: string; logoUrl: string | null }) {
  return <div className="flex items-center justify-center gap-3">
    <AppIcon appName={appName} logoUrl={logoUrl} className="size-11" />
    <span className="text-[1.75rem] font-bold leading-none tracking-tight">{appName}</span>
  </div>
}

export function AuthAgreement() {
  return <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
    <span className="block">By continuing, you agree to our</span>
    <span className="mt-0.5 inline-flex whitespace-nowrap">
      <Link href="/terms-of-service" className="text-foreground/80 underline-offset-2 hover:underline">Terms of Service</Link>
      <span className="whitespace-pre"> and </span>
      <Link href="/privacy-policy" className="text-foreground/80 underline-offset-2 hover:underline">Privacy Policy</Link>.
    </span>
  </p>
}

export function OwnedAuthDialog({ branding, open, onClose, next }: {
  branding: { appName: string; logoUrl: string | null }; open: boolean; onClose: () => void; next?: string | null
}) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
    <DialogContent
      className={cn('w-[92%] max-w-md gap-0 rounded-2xl p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:p-7 [&>[data-slot=dialog-close]]:right-3 [&>[data-slot=dialog-close]]:top-3', VISIBLE_AREA_DIALOG)}
      // Only the close button or Escape closes it. A stray tap beside the card (or on the
      // country list, the reCAPTCHA check or the keyboard closing) used to throw away the
      // number and the code being typed.
      onInteractOutside={event => event.preventDefault()}
    >
      <GradientTopLine />
      <div className="relative pb-5 pt-1 text-center">
        <AuthBrand appName={branding.appName} logoUrl={branding.logoUrl} />
        <DialogTitle className="sr-only">Sign in to {branding.appName}</DialogTitle>
        <DialogDescription className="mx-auto mt-4 max-w-sm text-center text-sm leading-6 text-muted-foreground">
          Sign in or create your account with your phone number.
        </DialogDescription>
      </div>
      {open ? <PhoneSignIn next={next} /> : null}
      <AuthAgreement />
    </DialogContent>
  </Dialog>
}
