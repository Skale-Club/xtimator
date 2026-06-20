'use client'

import { useCallback, useState, useRef, startTransition, useEffect } from 'react'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { SURVEY_STEPS } from './survey-config'

export interface UseSurveyStateReturn {
  stepIndex: number
  totalSteps: number
  currentStep: (typeof SURVEY_STEPS)[number]
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  logoFile: File | null
  setLogoFile: (f: File | null) => void
  logoPreview: string | null
  setLogoPreview: (p: string | null) => void
  error: string | null
  goNext: () => void
  goBack: () => void
  isFirst: boolean
  isLast: boolean
  /** True when the current step's primary field(s) have a user-provided value. */
  isStepFilled: boolean
  /** False until the client has restored any persisted draft. Shell hides content until true. */
  ready: boolean
  /** Call after successful completion to wipe the persisted draft. */
  clearPersistedState: () => void
}

// ── Persistence helpers ───────────────────────────────────────────────────────

interface PersistedDraft {
  stepIndex: number
  values: OnboardingValues
}

function readDraft(key: string): Partial<PersistedDraft> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as PersistedDraft) : {}
  } catch {
    return {}
  }
}

function saveDraft(key: string, draft: PersistedDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Quota exceeded — silently skip.
  }
}

function deleteDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────

export function useSurveyState(
  initial: OnboardingValues,
  storageKey = 'xtimator_onboarding'
): UseSurveyStateReturn {
  // Always start with server-safe defaults so server and client render
  // identical HTML on the first pass — no hydration mismatch.
  const [stepIndex, setStepIndex] = useState(0)
  const [values, setValues] = useState<OnboardingValues>(initial)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Flips to true once localStorage has been read and applied client-side.
  const [ready, setReady] = useState(false)

  const totalSteps = SURVEY_STEPS.length

  // Refs so effects and event handlers always see the latest values without
  // being re-registered on every render.
  const valuesRef = useRef(values)
  valuesRef.current = values
  const logoFileRef = useRef(logoFile)
  logoFileRef.current = logoFile
  const stepIndexRef = useRef(stepIndex)
  stepIndexRef.current = stepIndex

  // ── Restore persisted draft (runs once after hydration) ──────────────────

  useEffect(() => {
    const draft = readDraft(storageKey)
    // Batch ALL state updates — including ready — in one transition so we jump
    // straight from the spinner to the correct step+values without an interim
    // render at step 0.
    startTransition(() => {
      if (draft.stepIndex !== undefined) setStepIndex(draft.stepIndex)
      if (draft.values) setValues((prev) => ({ ...prev, ...draft.values }))
      setReady(true)
    })
  }, [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist on every change (only after restore is done) ─────────────────

  useEffect(() => {
    if (!ready) return
    saveDraft(storageKey, { stepIndex, values })
  }, [storageKey, stepIndex, values, ready])

  // ── Intercept the browser back button ────────────────────────────────────
  // Push a guard history entry so pressing back never navigates away mid-wizard.
  // On step 0 we let the browser navigate normally (back to the previous page).

  useEffect(() => {
    if (!ready) return

    // Push a guard so there is always a history entry to catch the next back press.
    history.pushState({ xtimatorOnboarding: true }, '')

    function handlePopState() {
      if (stepIndexRef.current > 0) {
        setError(null)
        startTransition(() => {
          setStepIndex((i) => Math.max(i - 1, 0))
        })
        // Re-push the guard so the NEXT back press is also caught.
        history.pushState({ xtimatorOnboarding: true }, '')
      }
      // stepIndex === 0: let the pop proceed — browser navigates to the previous URL (login).
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [ready]) // register once when ready; stepIndexRef keeps the closure current

  // ── Navigation ───────────────────────────────────────────────────────────

  const setValue = useCallback(
    <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => {
      setValues((prev) => ({ ...prev, [k]: v }))
      setError(null)
    },
    []
  )

  const currentStep = SURVEY_STEPS[stepIndex]

  const goNext = useCallback(() => {
    const step = SURVEY_STEPS[stepIndexRef.current]
    const msg = step.validate(valuesRef.current, logoFileRef.current)
    if (msg !== null) {
      setError(msg)
      return
    }
    setError(null)
    startTransition(() => {
      setStepIndex((i) => Math.min(i + 1, totalSteps - 1))
    })
  }, [totalSteps])

  const goBack = useCallback(() => {
    setError(null)
    startTransition(() => {
      setStepIndex((i) => Math.max(i - 1, 0))
    })
  }, [])

  const clearPersistedState = useCallback(() => {
    deleteDraft(storageKey)
  }, [storageKey])

  return {
    stepIndex,
    totalSteps,
    currentStep,
    values,
    setValue,
    logoFile,
    setLogoFile,
    logoPreview,
    setLogoPreview,
    error,
    goNext,
    goBack,
    isFirst: stepIndex === 0,
    isLast: stepIndex === totalSteps - 1,
    isStepFilled: currentStep.isFilled(values, logoFile),
    ready,
    clearPersistedState,
  }
}
