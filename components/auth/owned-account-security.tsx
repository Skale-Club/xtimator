'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsCard } from '@/components/settings/settings-ui'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { PhoneSignIn } from './phone-sign-in'
import '@/lib/visual-viewport'
import { identityError } from '@/lib/auth/google-browser'
import { invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'

export function OwnedAccountSecurity({ loginPhone = null }: { loginPhone?: string | null }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/auth/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sent ? { action: 'verify', purpose: 'email', code } : { action: 'send', purpose: 'email', email }) })
      const value = await response.json()
      if (!response.ok) throw { code: value.code }
      setSent(!sent); setCode('')
      setMessage(sent ? 'Your email has been verified and saved.' : 'Check your new email for the verification code.')
      if (sent) invalidateOwnedBrowserSession()
    } catch (error) { setError(identityError(error)) }
    finally { setBusy(false) }
  }
  return <>
    <SettingsCard title="Login phone">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{loginPhone ?? 'Not added'}</p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{loginPhone ? 'Change login phone' : 'Add phone'}</Button>
      </div>
    </SettingsCard>
    <SettingsCard title="Verified email" description="Used for account recovery and team invitations.">
      <form onSubmit={submit} className="max-w-sm space-y-3">
        <label htmlFor="owned-account-email" className="block text-sm">New email address</label>
        <Input id="owned-account-email" type="email" inputMode="email" autoComplete="email" enterKeyHint="send" value={email} onChange={event => setEmail(event.target.value)} disabled={busy || sent} required />
        {sent ? <><label htmlFor="owned-email-code" className="block text-sm">Verification code</label><Input id="owned-email-code" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="go" autoFocus maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        <Button disabled={busy || (sent && code.length !== 6)}>{sent ? 'Verify email' : 'Send verification code'}</Button>
        {sent ? <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSent(false); setCode('') }}>Change email or request another code</Button> : null}
      </form>
    </SettingsCard>
    <Dialog open={open} onOpenChange={setOpen}><BottomSheetContent desktopClassName="sm:max-w-md" onInteractOutside={event => event.preventDefault()}>
      <div data-sheet-drag="" className="flex shrink-0 items-center justify-between gap-3 pb-2 pl-5 pr-3 pt-1 touch-none sm:pl-6 sm:pt-5">
        <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">{loginPhone ? 'Change login phone' : 'Add phone'}</DialogTitle>
        <BottomSheetCloseButton label="Close" />
      </div>
      <DialogDescription className="sr-only">Verify the phone with a text message code.</DialogDescription>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-6 sm:pb-6">{open ? <PhoneSignIn purpose="link" allowGoogle={!!loginPhone} /> : null}</div>
    </BottomSheetContent></Dialog>
  </>
}
