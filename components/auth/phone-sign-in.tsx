'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { CodeInput } from './code-input'
import { cancelPhoneChallenge, confirmPhoneCode, googleIdentityLogin, identityError, requestPhoneCode, type IdentityConfig } from '@/lib/auth/google-browser'
import { invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'
import '@/lib/visual-viewport'

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw { code: value.code }
  return value as { status: string; redirectTo?: string }
}

export function PhoneSignIn({ next = null, purpose = 'login' }: { next?: string | null; purpose?: 'login' | 'link' }) {
  const [config, setConfig] = useState<IdentityConfig | null>(null)
  const [step, setStep] = useState<'phone' | 'code' | 'email' | 'email-code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  // Recovery by verified email is offered only when the server says an existing account needs it.
  const [recoveryOffered, setRecoveryOffered] = useState(false)
  const [notice, setNotice] = useState('')
  const [emailFlow, setEmailFlow] = useState<'recovery' | 'invite'>('recovery')
  const [inviteDestination, setInviteDestination] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const lock = useRef(false)
  const alive = useRef(true)
  const fieldId = useId()

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    fetch('/api/auth/config', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const value = await response.json()
      if (!response.ok || value.mode !== 'owned' || !value.firebase) throw new Error('Missing identity configuration')
      if (alive.current) setConfig(value.firebase)
    }).catch(error => { if (error.name !== 'AbortError' && alive.current) setError('Sign-in is temporarily unavailable. Please try again.') })
    return () => { alive.current = false; controller.abort(); cancelPhoneChallenge() }
  }, [])
  useEffect(() => {
    if (step !== 'code' || !retryAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [step, retryAt])

  async function run(operation: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await operation() }
    catch (error) {
      if (!alive.current) return
      setError(identityError(error))
      const code = (error as { code?: string })?.code
      if (code === 'account_recovery_required' || code === 'identity_conflict') setRecoveryOffered(true)
    }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }

  async function exchange(idToken: string) {
    const value = await post('/api/auth/identity', { idToken, next, purpose })
    if (!alive.current) return
    if (value.status === 'phone_required') { setStep('phone'); setNotice('Verify your phone to finish linking your account.'); return }
    if (!value.redirectTo?.startsWith('/') || value.redirectTo.startsWith('//')) throw new Error('Invalid sign-in destination')
    if (value.status === 'email_required') {
      setInviteDestination(value.redirectTo); setEmailFlow('invite'); setStep('email'); setCode('')
      setNotice('Verify the email address that received your team invitation to join the company.')
      return
    }
    invalidateOwnedBrowserSession()
    window.dispatchEvent(new Event('xtimator:auth'))
    if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('xtimator-auth'); channel.postMessage('changed'); channel.close() }
    window.location.assign(value.redirectTo)
  }

  async function sendPhone() {
    const target = '+' + phone.replace(/\D/g, '')
    if (!/^\+[1-9]\d{7,14}$/.test(target)) { setError('Enter a valid phone number, including the country code.'); return }
    if (!config) return
    await requestPhoneCode(config, target)
    if (!alive.current) return
    setPhone(target); setCode(''); setStep('code'); setNow(Date.now()); setRetryAt(Date.now() + 30_000)
  }

  function submit(event?: FormEvent, codeValue = code) {
    event?.preventDefault()
    void run(async () => {
      if (step === 'phone') await sendPhone()
      else if (step === 'code') await exchange(await confirmPhoneCode('+' + phone.replace(/\D/g, ''), codeValue))
      else if (step === 'email') {
        await post('/api/auth/recovery', { action: 'send', email, purpose: emailFlow === 'invite' ? 'email' : 'recovery' })
        if (alive.current) { setStep('email-code'); setCode(''); setNotice('If this email belongs to a verified account, we sent a code.'); setRetryAt(Date.now() + 60_000) }
      } else {
        await post('/api/auth/recovery', { action: 'verify', code: codeValue, purpose: emailFlow === 'invite' ? 'email' : 'recovery' })
        if (alive.current && emailFlow === 'invite' && inviteDestination) { invalidateOwnedBrowserSession(); window.location.assign(inviteDestination) }
        else if (alive.current) { setStep('phone'); setCode(''); setNotice('Now verify the phone you want to use for this account.') }
      }
    })
  }

  function onCode(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    // A full code goes through on its own, so the keyboard never has to be closed to find the button.
    if (digits.length === 6 && !lock.current) submit(undefined, digits)
  }

  function restart() {
    cancelPhoneChallenge(); setStep('phone'); setCode(''); setError(''); setNotice('')
  }

  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const codeStep = step === 'code' || step === 'email-code'
  const errorBox = error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">{error}</p> : null
  const noticeBox = notice ? <p role="status" className="text-center text-sm text-muted-foreground">{notice}</p> : null
  const primary = 'h-12 w-full rounded-xl text-base font-semibold'

  if (codeStep) return <form onSubmit={submit} className="space-y-4">
    <button type="button" onClick={restart} disabled={busy} className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />{step === 'code' ? 'Use another number' : 'Back'}</button>
    <div>
      <p className="text-lg font-bold">Enter the code</p>
      <p className="mt-1 text-sm text-muted-foreground">{step === 'code' ? `We texted a 6-digit code to ${phone}.` : `If ${email} belongs to a verified account, we emailed it a 6-digit code.`}</p>
    </div>
    {errorBox}
    <CodeInput key={step} id={fieldId} value={code} onChange={onCode} disabled={busy} />
    <Button type="submit" className={primary} disabled={busy || !config || code.length !== 6}>
      {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}Continue
    </Button>
    {step === 'code' ? <button type="button" disabled={busy || seconds > 0} onClick={() => { void run(sendPhone) }} className="min-h-10 w-full text-sm text-primary transition-colors hover:text-foreground disabled:text-muted-foreground">{seconds > 0 ? `New code in ${seconds}s` : 'Send a new code'}</button> : null}
  </form>

  if (step === 'email') return <form onSubmit={submit} className="space-y-4">
    <button type="button" onClick={restart} disabled={busy} className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Back</button>
    <div>
      <p className="text-lg font-bold">{emailFlow === 'invite' ? 'Verify your invitation email' : 'Recover your account'}</p>
      <p className="mt-1 text-sm text-muted-foreground">{emailFlow === 'invite' ? 'Use the email address that received your team invitation.' : 'Your account already exists. Confirm the email it uses and we’ll send you a code.'}</p>
    </div>
    {noticeBox}
    {errorBox}
    <div className="space-y-2">
      <label htmlFor={fieldId} className="block text-sm font-medium">Account email</label>
      <Input id={fieldId} type="email" inputMode="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} required className="h-12 rounded-xl !text-base" />
    </div>
    <Button type="submit" className={primary} disabled={busy || !config}>
      {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}Send code<ArrowRight className="ml-1 size-4" aria-hidden />
    </Button>
  </form>

  return <div className="space-y-4">
    {purpose === 'link' ? <div className="space-y-1 text-center">
      <p className="text-lg font-bold">Verify your login phone</p>
      <p className="text-sm text-muted-foreground">We’ll text you a 6-digit code.</p>
    </div> : null}
    {noticeBox}
    {errorBox}
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-medium">Phone number</label>
        <PhoneInput id={fieldId} value={phone} onChange={setPhone} onEnter={() => submit()} disabled={busy || !config} className="[&_button]:h-12 [&_button]:rounded-xl [&_input]:h-12 [&_input]:rounded-xl [&_input]:!text-base" />
      </div>
      <Button type="submit" className={primary} disabled={busy || !config}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}Send code<ArrowRight className="ml-1 size-4" aria-hidden />
      </Button>
    </form>
    <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
    <Button type="button" variant="outline" className="h-12 w-full gap-2 rounded-xl text-base" disabled={busy || !config} onClick={() => { void run(async () => { if (config) await exchange(await googleIdentityLogin(config)) }) }}>
      <GoogleMark />Continue with Google
    </Button>
    {purpose === 'login' && recoveryOffered ? <button type="button" className="min-h-10 w-full text-sm text-primary underline-offset-4 hover:underline focus-visible:underline" disabled={busy} onClick={() => { setEmailFlow('recovery'); setStep('email'); setCode(''); setError(''); setNotice('') }}>Recover existing account</button> : null}
  </div>
}

function GoogleMark() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-5 shrink-0">
    <path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92c-.26 1.28-1.02 2.37-2.15 3.1v2.58h3.48c2.04-1.88 3.21-4.65 3.21-7.55Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.48-2.58c-.98.66-2.24 1.06-3.8 1.06-2.87 0-5.3-1.94-6.17-4.54H2.23v2.66C4.04 20.53 7.73 23 12 23Z" />
    <path fill="#FBBC05" d="M5.83 14.28A6.6 6.6 0 0 1 5.48 12c0-.79.14-1.55.35-2.28V7.06H2.23A10.94 10.94 0 0 0 1 12c0 1.78.43 3.45 1.23 4.94l3.6-2.66Z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.73 1 4.04 3.47 2.23 7.06l3.6 2.66C6.7 7.12 9.13 5.38 12 5.38Z" />
  </svg>
}
