'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveOnboardingDraft } from '@/lib/actions/onboarding-draft'
import { draftValues, type OnboardingDraft } from './draft'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import type { SurveyStepKey } from '@/components/onboarding/survey/survey-config'

export function useDraftAutosave(draft: OnboardingDraft | undefined, values: OnboardingValues, step: SurveyStepKey, ready: boolean) {
  const [status, setStatus] = useState<'saving' | 'saved' | 'error'>('saved')
  const clientId = useRef<string | null>(null)
  const sequence = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<Parameters<typeof saveOnboardingDraft>[0]>(null)
  const alive = useRef(true)
  const serialized = JSON.stringify(draftValues(values))
  const draftId = draft?.id
  const draftMode = draft?.mode

  const persist = useCallback(async (input: unknown) => {
    const result = await saveOnboardingDraft(input)
    if (alive.current && input === latest.current) setStatus(result.error ? 'error' : 'saved')
    return result
  }, [])
  const enqueue = useCallback((input: unknown) => {
    queue.current = queue.current.catch(() => undefined).then(() => persist(input)).catch(() => {
      if (alive.current && input === latest.current) setStatus('error')
    })
    return queue.current
  }, [persist])

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!draftId || !draftMode || !ready) return
    clientId.current ??= crypto.randomUUID()
    const input = { id: draftId, mode: draftMode, step, values: JSON.parse(serialized), clientId: clientId.current, sequence: ++sequence.current }
    latest.current = input
    setStatus('saving')
    timer.current = setTimeout(() => { void enqueue(input) }, 600)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [draftId, draftMode, ready, serialized, step, enqueue])

  useEffect(() => {
    const flush = () => {
      if (!latest.current || !navigator.sendBeacon) return
      navigator.sendBeacon('/api/onboarding/draft', new Blob([JSON.stringify(latest.current)], { type: 'application/json' }))
    }
    const visibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visibility)
    const retry = () => { if (latest.current) void enqueue(latest.current) }
    window.addEventListener('online', retry)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', retry) }
  }, [enqueue])

  const retry = useCallback(() => { if (latest.current) { setStatus('saving'); void enqueue(latest.current) } }, [enqueue])
  const prepareCompletion = useCallback(async (finalValues: OnboardingValues) => {
    if (!draft) throw new Error('Draft unavailable')
    if (timer.current) clearTimeout(timer.current)
    await queue.current.catch(() => undefined)
    clientId.current ??= crypto.randomUUID()
    const input = { id: draft.id, mode: draft.mode, step: 'brandColor' as const, values: draftValues(finalValues), clientId: clientId.current, sequence: ++sequence.current }
    latest.current = input
    return input
  }, [draft])

  return { status: draft ? status : undefined, retry, prepareCompletion }
}
