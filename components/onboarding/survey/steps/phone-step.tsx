'use client'

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { ArrowLeft } from 'lucide-react'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import { CodeInput } from '@/components/auth/code-input'
import { cancelPhoneChallenge, confirmPhoneCode, identityError, requestPhoneCode, type IdentityConfig } from '@/lib/auth/google-browser'
import { invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { useTranslation } from '@/lib/i18n/use-translation'

export interface PhoneStepHandle {
  /** Runs the footer's Next: send the code, confirm it, or move on once the number is verified. */
  next: () => void
}

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
  /** The number already verified for this account in this session, in E.164. */
  verifiedPhone: string | null
  onVerified?: (phone: string) => void
  onBusyChange?: (busy: boolean) => void
  ref?: Ref<PhoneStepHandle>
}

const e164 = (value: string) => '+' + value.replace(/\D/g, '')

export function PhoneStep({ values, setValue, onNext, verifiedPhone, onVerified, onBusyChange, ref }: Props) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<IdentityConfig | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const lock = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    fetch('/api/auth/config', { cache: 'no-store', signal: controller.signal })
      .then(response => response.json())
      .then(value => { if (alive.current && value?.firebase) setConfig(value.firebase) })
      .catch(() => undefined)
    return () => { alive.current = false; controller.abort(); cancelPhoneChallenge() }
  }, [])
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  useEffect(() => {
    if (!sentTo || !retryAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sentTo, retryAt])

  async function run(operation: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await operation() }
    catch (failure) {
      if (!alive.current) return
      const failureCode = (failure as { code?: string })?.code
      setError(failureCode === 'identity_conflict' ? t('This number is already used by another Xtimator account.') : t(identityError(failure)))
    } finally { lock.current = false; if (alive.current) setBusy(false) }
  }

  async function send(target: string) {
    if (!config) throw new Error('Missing identity configuration')
    await requestPhoneCode(config, target)
    if (!alive.current) return
    setSentTo(target); setCode(''); setNow(Date.now()); setRetryAt(Date.now() + 30_000)
  }

  async function confirm(value: string) {
    if (!sentTo) return
    const idToken = await confirmPhoneCode(sentTo, value)
    const response = await fetch('/api/auth/identity', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, purpose: 'link' }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.status !== 'active') throw { code: body.code }
    invalidateOwnedBrowserSession()
    if (!alive.current) return
    setValue('phone', sentTo)
    onVerified?.(sentTo)
    onNext()
  }

  function next() {
    const digits = values.phone.replace(/\D/g, '')
    if (!digits) { onNext(); return }
    const target = e164(values.phone)
    if (!/^\+[1-9]\d{7,14}$/.test(target)) { setError(t('Enter a valid phone number, including the country code.')); return }
    if (target === verifiedPhone) { onNext(); return }
    if (!sentTo) { void run(() => send(target)); return }
    if (code.length !== 6) { setError(t('Enter the 6-digit code.')); return }
    void run(() => confirm(code))
  }
  useImperativeHandle(ref, () => ({ next }))

  function onCode(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits); setError('')
    if (digits.length === 6 && !lock.current) void run(() => confirm(digits))
  }

  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const errorLine = error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null

  if (sentTo) return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => { cancelPhoneChallenge(); setSentTo(null); setCode(''); setError('') }} disabled={busy}
        className="flex min-h-10 items-center gap-2 self-start text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />{t('Change number')}
      </button>
      <p className="text-sm text-muted-foreground">{t('Code sent to')} {sentTo}</p>
      <CodeInput id="survey-phone-code" value={code} onChange={onCode} disabled={busy} label={t('6-digit code')} />
      {errorLine}
      <button type="button" disabled={busy || seconds > 0} onClick={() => { void run(() => send(sentTo)) }}
        className="min-h-10 text-sm text-primary transition-colors hover:text-foreground disabled:text-muted-foreground">
        {seconds > 0 ? `${t('New code in')} ${seconds}s` : t('Send a new code')}
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="survey-phone" className="sr-only">
        {t('Phone')}
      </Label>
      <PhoneInput
        id="survey-phone"
        value={values.phone}
        onChange={(formatted) => setValue('phone', formatted)}
        onEnter={next}
        enterKeyHint="next"
        placeholder="(555) 123-4567"
        autoFocus
        disabled={busy}
        className="[&_input]:text-base"
      />
      {errorLine}
    </div>
  )
}
