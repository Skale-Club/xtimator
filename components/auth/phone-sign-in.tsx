'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { CodeInput } from './code-input'
import { cancelPhoneChallenge, confirmPhoneCode, prepareGoogleIdentityLogin, identityError, requestPhoneCode, type IdentityConfig } from '@/lib/auth/google-browser'
import { invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'
import '@/lib/visual-viewport'

const NETWORK_TIMEOUT = 15_000
const TRY_AGAIN = { code: 'auth/network-request-failed' }

async function withDeadline<T>(signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>, timeout = NETWORK_TIMEOUT) {
  if (signal.aborted) throw signal.reason
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(() => controller.abort(TRY_AGAIN), timeout)
  try {
    return await new Promise<T>((resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
      operation(controller.signal).then(resolve, reject)
    })
  } finally {
    signal.removeEventListener('abort', abort)
    window.clearTimeout(timer)
  }
}

async function jsonRequest(url: string, options: RequestInit, signal: AbortSignal) {
  return withDeadline(signal, async requestSignal => {
    try {
      const response = await fetch(url, { ...options, signal: requestSignal })
      return { response, value: await response.json().catch(() => null) }
    } catch {
      throw TRY_AGAIN
    }
  })
}

async function post(url: string, body: unknown, signal: AbortSignal) {
  const { response, value } = await jsonRequest(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, signal)
  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After')
    const retryAt = retryAfter && /^\d+$/.test(retryAfter) ? Date.now() + Number(retryAfter) * 1000 : Date.parse(retryAfter ?? '')
    throw { code: response.status === 429 ? 'rate_limited' : value?.code, retryAt }
  }
  return value as { status?: string; redirectTo?: string } | null
}

export function PhoneSignIn({ next = null, purpose = 'login', allowGoogle = true }: { next?: string | null; purpose?: 'login' | 'link'; allowGoogle?: boolean }) {
  const [config, setConfig] = useState<IdentityConfig | null>(null)
  const [configAttempt, setConfigAttempt] = useState(0)
  const [configError, setConfigError] = useState('')
  const [googleLogin, setGoogleLogin] = useState<(() => Promise<string>) | null>(null)
  const [googleAttempt, setGoogleAttempt] = useState(0)
  const [googleError, setGoogleError] = useState('')
  const [step, setStep] = useState<'phone' | 'code' | 'email' | 'email-code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [emailFlow, setEmailFlow] = useState<'recovery' | 'invite'>('recovery')
  const [inviteDestination, setInviteDestination] = useState<string | null>(null)
  const [pending, setPending] = useState<'phone' | 'google' | null>(null)
  const busy = pending !== null
  const [phoneRetryAt, setPhoneRetryAt] = useState(0)
  const [emailRetryAt, setEmailRetryAt] = useState(0)
  const [emailVerifyRetryAt, setEmailVerifyRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const lock = useRef(false)
  const activeAction = useRef<AbortController | null>(null)
  const fieldId = useId()

  useEffect(() => () => { activeAction.current?.abort(); cancelPhoneChallenge() }, [])
  useEffect(() => {
    const controller = new AbortController()
    jsonRequest('/api/auth/config', { cache: 'no-store' }, controller.signal).then(({ response, value }) => {
      const firebase = value?.firebase
      if (!response.ok || value?.mode !== 'owned' || ![firebase?.apiKey, firebase?.projectId, firebase?.authDomain].every(field => typeof field === 'string' && field.trim())) {
        throw new Error('Missing identity configuration')
      }
      if (!controller.signal.aborted) setConfig(firebase)
    }).catch(error => { if (!controller.signal.aborted) setConfigError(identityError(error)) })
    return () => controller.abort()
  }, [configAttempt])
  useEffect(() => {
    if (!config || !allowGoogle) return
    const controller = new AbortController()
    setGoogleLogin(null)
    setGoogleError('')
    withDeadline(controller.signal, () => prepareGoogleIdentityLogin(config)).then(login => {
      if (!controller.signal.aborted) setGoogleLogin(() => login)
    }).catch(error => { if (!controller.signal.aborted) setGoogleError(identityError(error)) })
    return () => controller.abort()
  }, [config, allowGoogle, googleAttempt])
  const ticking = Math.max(phoneRetryAt, emailRetryAt, emailVerifyRetryAt) > now
  useEffect(() => {
    if (!ticking) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [ticking])

  async function run(operation: (signal: AbortSignal) => Promise<void>, action: 'phone' | 'google' = 'phone') {
    if (lock.current) return
    const controller = new AbortController()
    activeAction.current = controller
    lock.current = true; setPending(action); setError('')
    try { await operation(controller.signal) }
    catch (error) {
      if (controller.signal.aborted) return
      const code = (error as { code?: string })?.code
      // Adding or changing a phone: a conflict means the number belongs to another account.
      setError(purpose === 'link' && code === 'identity_conflict' ? 'This number is already used by another Xtimator account.' : identityError(error))
    }
    finally { lock.current = false; activeAction.current = null; if (!controller.signal.aborted) setPending(null) }
  }

  async function exchange(idToken: string, signal: AbortSignal) {
    const value = await post('/api/auth/identity', { idToken, next, purpose }, signal)
    if (signal.aborted) return
    if (!value) throw new Error('Invalid sign-in response')
    if (value.status === 'phone_required') { setStep('phone'); setNotice('Verify your phone to finish linking your account.'); return }
    if (!value.redirectTo?.startsWith('/') || value.redirectTo.startsWith('//')) throw new Error('Invalid sign-in destination')
    if (value.status === 'email_required') {
      setInviteDestination(value.redirectTo); setEmailFlow('invite'); setStep('email'); setCode('')
      setNotice('Verify the email address that received your team invitation to join the company.')
      return
    }
    if (value.status !== 'active') throw new Error('Invalid sign-in status')
    invalidateOwnedBrowserSession()
    window.dispatchEvent(new Event('xtimator:auth'))
    if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('xtimator-auth'); channel.postMessage('changed'); channel.close() }
    window.location.assign(value.redirectTo)
  }

  async function sendPhone(signal: AbortSignal) {
    const target = '+' + phone.replace(/\D/g, '')
    if (!/^\+[1-9]\d{7,14}$/.test(target)) { setError('Enter a valid phone number, including the country code.'); return }
    if (!config) return
    try { await withDeadline(signal, () => requestPhoneCode(config, target), 30_000) }
    catch (error) {
      if (!signal.aborted && error === TRY_AGAIN) cancelPhoneChallenge()
      throw error
    }
    if (signal.aborted) return
    const sentAt = Date.now()
    setPhone(target); setCode(''); setStep('code'); setNow(sentAt); setPhoneRetryAt(sentAt + 30_000)
  }

  async function requestEmail(action: 'send' | 'verify', signal: AbortSignal, codeValue?: string) {
    const body = action === 'send' ? { action, email } : { action, code: codeValue }
    try { return await post('/api/auth/recovery', { ...body, purpose: emailFlow === 'invite' ? 'email' : 'recovery' }, signal) }
    catch (error) {
      const { code, retryAt } = error as { code?: string; retryAt?: number }
      if (!signal.aborted && code === 'rate_limited') {
        const current = Date.now()
        const setDeadline = action === 'send' ? setEmailRetryAt : setEmailVerifyRetryAt
        setNow(current)
        setDeadline(Math.max(current + 1000, retryAt && Number.isFinite(retryAt) ? retryAt : current + 60_000))
      }
      throw error
    }
  }

  async function sendEmail(signal: AbortSignal) {
    if (emailRetryAt > Date.now()) return
    const value = await requestEmail('send', signal)
    if (signal.aborted) return
    if (value?.status !== 'code_sent') throw new Error('Invalid email response')
    const sentAt = Date.now()
    setStep('email-code'); setCode(''); setNotice(''); setNow(sentAt); setEmailRetryAt(sentAt + 60_000)
  }

  function submit(event?: FormEvent, codeValue = code) {
    event?.preventDefault()
    if ((step === 'code' || step === 'email-code') && codeValue.length !== 6) return
    if ((step === 'email' && emailRetryAt > Date.now()) || (step === 'email-code' && emailVerifyRetryAt > Date.now())) return
    void run(async signal => {
      if (step === 'phone') await sendPhone(signal)
      else if (step === 'code') {
        const token = await withDeadline(signal, () => confirmPhoneCode(phone, codeValue))
        await exchange(token, signal)
      } else if (step === 'email') await sendEmail(signal)
      else {
        const value = await requestEmail('verify', signal, codeValue)
        if (signal.aborted) return
        if (emailFlow === 'invite' && value?.status === 'email_verified' && inviteDestination) { invalidateOwnedBrowserSession(); window.location.assign(inviteDestination) }
        else if (emailFlow === 'recovery' && value?.status === 'phone_required') { setStep('phone'); setCode(''); setNotice('Now verify the phone you want to use for this account.') }
        else throw new Error('Invalid verification response')
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

  function startRecovery() {
    cancelPhoneChallenge(); setEmailFlow('recovery'); setStep('email'); setCode(''); setError(''); setNotice('')
  }

  const secondsUntil = (at: number) => Math.max(0, Math.ceil((at - now) / 1000))
  const seconds = secondsUntil(step === 'code' ? phoneRetryAt : emailRetryAt)
  const verifySeconds = step === 'email-code' ? secondsUntil(emailVerifyRetryAt) : 0
  const codeStep = step === 'code' || step === 'email-code'
  const errorBox = error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">{error}</p> : null
  const noticeBox = notice ? <p role="status" className="text-center text-sm text-muted-foreground">{notice}</p> : null
  const primary = 'h-12 w-full rounded-xl text-base font-semibold'
  const recoveryLink = purpose === 'login' ? <button type="button" className="min-h-10 w-full text-sm text-primary underline-offset-4 hover:underline focus-visible:underline" disabled={busy} onClick={startRecovery}>Recover existing account</button> : null

  if (codeStep) return <form onSubmit={submit} className="space-y-4">
    <button type="button" onClick={step === 'code' ? restart : () => { setStep('email'); setError(''); setCode('') }} disabled={busy} className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />{step === 'code' ? 'Use another number' : 'Back'}</button>
    <div>
      <p className="text-lg font-bold">Enter the code</p>
      <p className="mt-1 text-sm text-muted-foreground">{step === 'code' ? `We texted a 6-digit code to ${phone}.` : `If ${email} belongs to a verified account, we emailed it a 6-digit code.`}</p>
    </div>
    {errorBox}
    <CodeInput key={step} id={fieldId} value={code} onChange={onCode} disabled={busy} />
    <Button type="submit" className={primary} disabled={busy || verifySeconds > 0 || code.length !== 6}>
      {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}{verifySeconds > 0 ? `Try again in ${verifySeconds}s` : 'Continue'}
    </Button>
    <button type="button" disabled={busy || seconds > 0} onClick={() => { void run(step === 'code' ? sendPhone : sendEmail) }} className="min-h-10 w-full text-sm text-primary transition-colors hover:text-foreground disabled:text-muted-foreground">{seconds > 0 ? `New code in ${seconds}s` : 'Send a new code'}</button>
    {step === 'code' ? recoveryLink : null}
  </form>

  if (step === 'email') return <form onSubmit={submit} className="space-y-4">
    <button type="button" onClick={restart} disabled={busy} className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Back</button>
    <div>
      <p className="text-lg font-bold">{emailFlow === 'invite' ? 'Verify your invitation email' : 'Recover your account'}</p>
      <p className="mt-1 text-sm text-muted-foreground">{emailFlow === 'invite' ? 'Use the email address that received your team invitation.' : 'Enter the verified email address on your account to request a code.'}</p>
    </div>
    {noticeBox}
    {errorBox}
    <div className="space-y-2">
      <label htmlFor={fieldId} className="block text-sm font-medium">Account email</label>
      <Input id={fieldId} type="email" inputMode="email" autoComplete="email" enterKeyHint="send" autoFocus placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} required className="h-12 rounded-xl !text-base" />
    </div>
    <Button type="submit" className={primary} disabled={busy || seconds > 0}>
      {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}{seconds > 0 ? `New code in ${seconds}s` : 'Send code'}<ArrowRight className="ml-1 size-4" aria-hidden />
    </Button>
  </form>

  return <div className="space-y-4">
    {noticeBox}
    {errorBox}
    {configError ? <div className="space-y-2">
      <p role="alert" className="text-sm text-destructive">{configError}</p>
      <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => { setConfigError(''); setConfigAttempt(attempt => attempt + 1) }}>Retry sign-in setup</Button>
    </div> : null}
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-medium">Phone number</label>
        <PhoneInput id={fieldId} value={phone} onChange={setPhone} enterKeyHint="send" onEnter={() => submit()} disabled={busy || !config} className="[&_button]:h-12 [&_button]:rounded-xl [&_input]:h-12 [&_input]:rounded-xl [&_input]:!text-base" />
      </div>
      <Button type="submit" className={primary} disabled={busy || !config}>
        {pending === 'phone' ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}Send code<ArrowRight className="ml-1 size-4" aria-hidden />
      </Button>
    </form>
    {allowGoogle ? <>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <Button type="button" variant="outline" className="h-12 w-full gap-2 rounded-xl text-base" aria-busy={pending === 'google'} disabled={busy || (!googleLogin && !googleError)} onClick={() => {
        if (googleError) { setGoogleError(''); setGoogleAttempt(attempt => attempt + 1) }
        else if (googleLogin) void run(async signal => { await exchange(await withDeadline(signal, googleLogin, 120_000), signal) }, 'google')
      }}>
        {pending === 'google' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleMark />}{googleError ? 'Retry Google setup' : 'Continue with Google'}
      </Button>
      {googleError ? <p role="alert" className="text-sm text-destructive">{googleError}</p> : null}
    </> : null}
    {recoveryLink}
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
