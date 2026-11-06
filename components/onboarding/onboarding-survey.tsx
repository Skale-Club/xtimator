'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useSurveyState } from '@/components/onboarding/survey/use-survey-state'
import { SurveyShell } from '@/components/onboarding/survey/survey-shell'
import { completeOnboarding, uploadOnboardingDraftLogo } from '@/lib/actions/onboarding-draft'
import { useDraftAutosave } from '@/lib/onboarding/use-draft-autosave'
import type { OnboardingDraft } from '@/lib/onboarding/draft'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { useTranslation } from '@/lib/i18n/use-translation'

const INITIAL: OnboardingValues = {
  companyName: '', subdomain: '', ownerName: '', phone: '', email: '', website: '',
  language: 'en', industries: [], customIndustries: [], prefillPriceBook: false,
  brandPrimaryColor: SYSTEM_COLORS.primary, logoUrl: '',
  address: '', city: '', state: '', zip: '', licenseNumber: '', insuranceInfo: '',
  defaultTaxRate: 0, defaultPaymentTerms: '', defaultWarrantyTerms: '', defaultValidityDays: 30,
}

export function OnboardingSurvey({ appName, logoUrl, mode = 'first', initialValues, draft }: {
  appName: string
  logoUrl: string | null
  mode?: 'first' | 'add'
  initialValues?: Partial<OnboardingValues>
  draft: OnboardingDraft
}) {
  const { t } = useTranslation()
  const translate = useRef(t)
  translate.current = t
  const state = useSurveyState({ ...INITIAL, ...initialValues }, `xtimator_onboarding_${mode}_${draft.id}`, draft)
  const autosave = useDraftAutosave(draft, state.values, state.currentStep.key, state.ready)
  const [isSubmitting, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(false)
  const [uploadAttempt, setUploadAttempt] = useState(0)
  const completing = useRef(false)
  const upload = useRef<{ file: File; promise: ReturnType<typeof uploadOnboardingDraftLogo> } | null>(null)
  const file = state.logoFile
  const savedLogo = state.values.logoUrl
  const { setValue, setLogoPreview } = state

  useEffect(() => {
    if (!file || savedLogo) { setUploading(false); setUploadError(false); return }
    let cancelled = false
    if (upload.current?.file !== file) {
      const form = new FormData()
      form.set('draftId', draft.id)
      form.set('file', file)
      upload.current = { file, promise: uploadOnboardingDraftLogo(form) }
    }
    setUploading(true)
    setUploadError(false)
    void upload.current.promise.then(result => {
      if (cancelled) return
      if (result.url) { setValue('logoUrl', result.url); setLogoPreview(result.url) }
      else { setUploadError(true); toast.error(translate.current(result.error ?? 'Could not save your logo. Please try again.')) }
    }).catch(() => {
      if (!cancelled) { setUploadError(true); toast.error(translate.current('Could not save your logo. Please try again.')) }
    }).finally(() => { if (!cancelled) setUploading(false) })
    return () => { cancelled = true }
  }, [draft.id, file, savedLogo, setValue, setLogoPreview, uploadAttempt])

  function handleComplete() {
    if (completing.current || uploading) return
    completing.current = true
    startTransition(async () => {
      try {
        let finalValues = state.values
        // Retry a failed background upload before completing; never silently lose a logo.
        if (state.logoFile && !finalValues.logoUrl) {
          const form = new FormData()
          form.set('draftId', draft.id); form.set('file', state.logoFile)
          const result = await uploadOnboardingDraftLogo(form)
          if (!result.url) { toast.error(t(result.error ?? 'Could not save your logo. Please try again.')); return }
          finalValues = { ...finalValues, logoUrl: result.url }
          state.setValue('logoUrl', result.url)
        }
        const payload = await autosave.prepareCompletion(finalValues)
        const result = await completeOnboarding(payload)
        if (result?.error) toast.error(t(result.error))
      } catch (error) {
        // Next handles the successful server-action redirect. Other failures stay retryable.
        if (error && typeof error === 'object' && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT;')) {
          state.clearPersistedState()
          throw error
        }
        toast.error(t('Could not finish setup. Please try again.'))
      } finally { completing.current = false }
    })
  }

  return <SurveyShell appName={appName} logoUrl={logoUrl} state={state}
    isSubmitting={isSubmitting} completionDisabled={uploading} onComplete={handleComplete}
    logoUploadStatus={uploading ? 'uploading' : uploadError ? 'error' : savedLogo ? 'saved' : undefined}
    onRetryLogo={() => { upload.current = null; setUploadAttempt(attempt => attempt + 1) }}
    draftStatus={uploading ? 'saving' : autosave.status} onRetrySave={autosave.retry} />
}
