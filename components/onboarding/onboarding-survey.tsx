'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useSurveyState } from '@/components/onboarding/survey/use-survey-state'
import { SurveyShell } from '@/components/onboarding/survey/survey-shell'
import { createOrUpdateCompany } from '@/lib/actions/company'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

const INITIAL: OnboardingValues = {
  companyName: '',
  ownerName: '',
  phone: '',
  email: '',
  website: '',
  language: 'en',
  industry: '',
  customIndustry: '',
  brandPrimaryColor: SYSTEM_COLORS.primary,
  address: '',
  city: '',
  state: '',
  zip: '',
  licenseNumber: '',
  insuranceInfo: '',
  defaultTaxRate: 0,
  defaultPaymentTerms: 'Net 30',
  defaultWarrantyTerms: '1 year',
  defaultValidityDays: 30,
}

export function OnboardingSurvey({ appName, logoUrl }: { appName: string; logoUrl: string | null }) {
  const state = useSurveyState(INITIAL)
  const [isSubmitting, startTransition] = useTransition()

  function handleComplete() {
    startTransition(async () => {
      try {
        let logoUrl: string | undefined
        if (state.logoFile) {
          try {
            const supabase = createClient()
            const { data: userData } = await supabase.auth.getUser()
            if (userData?.user) {
              const ext = state.logoFile.name.split('.').pop() || 'png'
              const path = `${userData.user.id}/logo.${ext}`
              try {
                await createStorage(supabase).upload('logos', path, state.logoFile, {
                  upsert: true,
                })
                logoUrl = path
              } catch {
                toast.error(
                  'Logo upload failed. Continuing without a logo.'
                )
              }
            }
          } catch {
            toast.error('Logo upload failed. Continuing without a logo.')
          }
        }

        const result = await createOrUpdateCompany({
          ...state.values,
          logoUrl,
        })
        if (result?.error) {
          toast.error(result.error)
        }
      } catch {
        // redirect throws NEXT_REDIRECT, which is expected
      }
    })
  }

  return (
    <SurveyShell
      appName={appName}
      logoUrl={logoUrl}
      state={state}
      isSubmitting={isSubmitting}
      onComplete={handleComplete}
    />
  )
}
