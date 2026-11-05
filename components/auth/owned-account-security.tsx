'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PhoneSignIn } from './phone-sign-in'
import { identityError } from '@/lib/auth/google-browser'
import { invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'

export function OwnedAccountSecurity() {
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
  return <Card><CardContent className="space-y-8 py-6">
    <section className="space-y-3">
      <h2 className="font-medium">Login phone</h2>
      <p className="text-sm text-muted-foreground">Sign in with a text message code. Changing your login phone requires a recent sign-in and verification of the new number. Your profile contact number is separate.</p>
      <Button variant="outline" onClick={() => setOpen(true)}>Verify a new login phone</Button>
    </section>
    <section className="space-y-3">
      <h2 className="font-medium">Verified email</h2>
      <p className="text-sm text-muted-foreground">Used for account recovery and team invitations.</p>
      <form onSubmit={submit} className="max-w-sm space-y-3">
        <label htmlFor="owned-account-email" className="block text-sm">New email address</label>
        <Input id="owned-account-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy || sent} required />
        {sent ? <><label htmlFor="owned-email-code" className="block text-sm">Verification code</label><Input id="owned-email-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        <Button disabled={busy || (sent && code.length !== 6)}>{sent ? 'Verify email' : 'Send verification code'}</Button>
        {sent ? <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSent(false); setCode('') }}>Change email or request another code</Button> : null}
      </form>
    </section>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-[400px]"><DialogTitle>Account verification</DialogTitle><DialogDescription className="sr-only">Verify a new login phone after a recent sign-in.</DialogDescription>{open ? <PhoneSignIn purpose="link" /> : null}</DialogContent></Dialog>
  </CardContent></Card>
}
