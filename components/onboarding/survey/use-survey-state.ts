'use client'

import { useCallback, useEffect, useRef, useState, startTransition } from 'react'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { useLanguage, type Language } from '@/lib/i18n/language-context'
import { draftValues, draftValuesSchema, type OnboardingDraft } from '@/lib/onboarding/draft'
import { SURVEY_STEPS, SURVEY_VERSION, type SurveyStepKey } from './survey-config'

export interface UseSurveyStateReturn {
  stepIndex: number; totalSteps: number; currentStep: (typeof SURVEY_STEPS)[number]
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(key: K, value: OnboardingValues[K]) => void
  logoFile: File | null; setLogoFile: (file: File | null) => void
  logoPreview: string | null; setLogoPreview: (preview: string | null) => void
  error: string | null
  goNext: (options?: { skipValidation?: boolean }) => void
  goBack: () => void; isFirst: boolean; isLast: boolean; isStepFilled: boolean
  ready: boolean; clearPersistedState: () => void
}
interface PersistedDraft {
  version?: number; stepKey?: SurveyStepKey; stepIndex?: number; savedAt?: number
  values?: Partial<OnboardingValues>
}
function readDraft(key: string): PersistedDraft {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} }
}

export function useSurveyState(initial: OnboardingValues, storageKey = 'xtimator_onboarding', serverDraft?: OnboardingDraft): UseSurveyStateReturn {
  const { setLanguage } = useLanguage()
  const [stepIndex, setStepIndex] = useState(0)
  const [values, setValues] = useState(initial)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const totalSteps = SURVEY_STEPS.length
  const activeIndex = Math.max(0, Math.min(stepIndex, totalSteps - 1))
  const currentStep = SURVEY_STEPS[activeIndex]
  const valuesRef = useRef(values); valuesRef.current = values
  const fileRef = useRef(logoFile); fileRef.current = logoFile
  const indexRef = useRef(activeIndex); indexRef.current = activeIndex

  useEffect(() => {
    const local = readDraft(storageKey)
    const remoteTime = Date.parse(serverDraft?.last_activity_at ?? '') || 0
    const source: PersistedDraft = serverDraft && !(typeof local.savedAt === 'number' && local.savedAt > remoteTime)
      ? { version: SURVEY_VERSION, stepKey: serverDraft.step, values: serverDraft.values } : local
    const parsed = draftValuesSchema.partial().safeParse(source.values ?? {})
    // Zod applies inner defaults even through partial(). Only restore keys the
    // draft actually contains, so an empty new draft keeps signup prefills.
    const restored = parsed.success ? Object.fromEntries(Object.entries(parsed.data).filter(([key]) => Object.hasOwn(source.values ?? {}, key))) as Partial<OnboardingValues> : {}
    let selected = restored.language
    try { selected ??= (localStorage.getItem('language') as Language | null) ?? initial.language } catch {}
    const language: Language = selected === 'pt' || selected === 'es' ? selected : 'en'
    const merged: OnboardingValues = { ...initial, ...restored, language,
      // Account contacts come from the verified session, never an old browser draft.
      phone: initial.phone, email: initial.email, ownerName: initial.ownerName,
      address: '', state: '', zip: '', licenseNumber: '', insuranceInfo: '',
    }
    const legacy = source.values as { industry?: string } | undefined
    if (legacy?.industry && !merged.industries.length) merged.industries = [legacy.industry]
    const key = source.version === SURVEY_VERSION ? source.stepKey : 'language'
    startTransition(() => {
      setValues(merged); setLanguage(language)
      setStepIndex(Math.max(0, SURVEY_STEPS.findIndex(step => step.key === key)))
      setLogoPreview(merged.logoUrl || null); setLogoFile(null); setError(null); setReady(true)
    })
  // Restore once per draft identity. Changing answers must not re-read old server props.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, setLanguage, serverDraft?.id])

  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(storageKey, JSON.stringify({ version: SURVEY_VERSION, stepKey: currentStep.key, stepIndex: activeIndex, savedAt: Date.now(), values: draftValues(values) })) } catch {}
  }, [storageKey, ready, currentStep.key, activeIndex, values])

  useEffect(() => {
    if (!ready) return
    history.pushState({ xtimatorOnboarding: true }, '')
    const back = () => {
      if (indexRef.current > 0) { setError(null); setStepIndex(index => Math.max(index - 1, 0)); history.pushState({ xtimatorOnboarding: true }, '') }
    }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [ready])

  const setValue = useCallback(<K extends keyof OnboardingValues>(key: K, value: OnboardingValues[K]) => {
    setValues(previous => ({ ...previous, [key]: value }))
    if (key === 'language' && (value === 'en' || value === 'pt' || value === 'es')) setLanguage(value)
    setError(null)
  }, [setLanguage])
  const goNext = useCallback((options?: { skipValidation?: boolean }) => {
    const step = SURVEY_STEPS[indexRef.current]
    const message = options?.skipValidation && !step.required ? null : step.validate(valuesRef.current, fileRef.current)
    if (message) { setError(message); return }
    setError(null); setStepIndex(index => Math.min(index + 1, totalSteps - 1))
  }, [totalSteps])
  const goBack = useCallback(() => { setError(null); setStepIndex(index => Math.max(index - 1, 0)) }, [])
  const clearPersistedState = useCallback(() => { try { localStorage.removeItem(storageKey) } catch {} }, [storageKey])
  return { stepIndex: activeIndex, totalSteps, currentStep, values, setValue, logoFile, setLogoFile, logoPreview, setLogoPreview, error, goNext, goBack,
    isFirst: activeIndex === 0, isLast: activeIndex === totalSteps - 1, isStepFilled: currentStep.isFilled(values, logoFile), ready, clearPersistedState }
}
