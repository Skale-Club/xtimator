'use client'

import { useCallback, useState } from 'react'
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
}

export function useSurveyState(initial: OnboardingValues): UseSurveyStateReturn {
  const [stepIndex, setStepIndex] = useState(0)
  const [values, setValues] = useState<OnboardingValues>(initial)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totalSteps = SURVEY_STEPS.length
  const currentStep = SURVEY_STEPS[stepIndex]

  const setValue = useCallback(
    <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => {
      setValues((prev) => ({ ...prev, [k]: v }))
      setError(null)
    },
    []
  )

  const goNext = useCallback(() => {
    const step = SURVEY_STEPS[stepIndex]
    // Recompute against latest values via setValues callback pattern
    setValues((current) => {
      const msg = step.validate(current, logoFile)
      if (msg !== null) {
        setError(msg)
        return current
      }
      setError(null)
      setStepIndex((i) => Math.min(i + 1, totalSteps - 1))
      return current
    })
  }, [stepIndex, logoFile, totalSteps])

  const goBack = useCallback(() => {
    setError(null)
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

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
  }
}
