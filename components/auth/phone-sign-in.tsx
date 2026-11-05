'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { cancelPhoneChallenge, confirmPhoneCode, googleIdentityLogin, identityError, requestPhoneCode, type IdentityConfig } from '@/lib/auth/google-browser'
import { invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'

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
    catch (error) { if (alive.current) setError(identityError(error)) }
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

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      if (step === 'phone') await sendPhone()
      else if (step === 'code') await exchange(await confirmPhoneCode('+' + phone.replace(/\D/g, ''), code))
      else if (step === 'email') {
        await post('/api/auth/recovery', { action: 'send', email, purpose: emailFlow === 'invite' ? 'email' : 'recovery' })
        if (alive.current) { setStep('email-code'); setCode(''); setNotice('If this email belongs to a verified account, we sent a code.'); setRetryAt(Date.now() + 60_000) }
      } else {
        await post('/api/auth/recovery', { action: 'verify', code, purpose: emailFlow === 'invite' ? 'email' : 'recovery' })
        if (alive.current && emailFlow === 'invite' && inviteDestination) { invalidateOwnedBrowserSession(); window.location.assign(inviteDestination) }
        else if (alive.current) { setStep('phone'); setCode(''); setNotice('Now verify the phone you want to use for this account.') }
      }
    })
  }

  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const codeStep = step === 'code' || step === 'email-code'
  return <div className="space-y-5">
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{purpose === 'link' ? 'Verify your login phone' : 'Continue with your phone'}</h2>
      <p className="text-sm text-muted-foreground">{step === 'code' ? `Enter the code sent to ${phone}.` : step === 'email' || step === 'email-code' ? emailFlow === 'invite' ? 'Verify your invitation email.' : 'Recover your existing account using its verified email.' : 'We’ll text you a code. No password needed.'}</p>
    </div>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={fieldId} className="text-sm font-medium">{codeStep ? 'Verification code' : step === 'email' ? 'Account email' : 'Phone number'}</label>
        {step === 'phone' ? <PhoneInput id={fieldId} value={phone} onChange={setPhone} disabled={busy || !config} />
          : codeStep ? <Input key={step} id={fieldId} autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} required />
          : <Input id={fieldId} type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} required />}
      </div>
      <Button type="submit" className="min-h-11 w-full" disabled={busy || !config || (codeStep && code.length !== 6)}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
        {step === 'phone' || step === 'email' ? 'Send code' : 'Verify and continue'}
      </Button>
    </form>
    {step === 'code' ? <Button type="button" variant="ghost" className="w-full" disabled={busy || seconds > 0} onClick={() => { void run(sendPhone) }}>{seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}</Button> : null}
    {step !== 'phone' ? <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => { cancelPhoneChallenge(); setStep('phone'); setCode(''); setError('') }}><ArrowLeft className="mr-2 size-4" />Change sign-in method</Button> : null}
    {step === 'phone' ? <>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <Button type="button" variant="outline" className="min-h-11 w-full" disabled={busy || !config} onClick={() => { void run(async () => { if (config) await exchange(await googleIdentityLogin(config)) }) }}>Continue with Google</Button>
      {purpose === 'login' ? <button type="button" className="min-h-11 w-full text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:underline" disabled={busy} onClick={() => { setEmailFlow('recovery'); setStep('email'); setCode(''); setError(''); setNotice('') }}>Recover existing account</button> : null}
    </> : null}
  </div>
}
