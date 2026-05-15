'use client'

import { useRef, useState, useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { onboardingSchema, STEP_FIELDS } from '@/lib/schemas/onboarding'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { createOrUpdateCompany } from '@/lib/actions/company'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { OnboardingCard } from '@/components/onboarding/onboarding-card'
import { StepIndicator } from '@/components/onboarding/step-indicator'
import { StepBusinessInfo } from '@/components/onboarding/step-business-info'
import { StepBrandIdentity } from '@/components/onboarding/step-brand-identity'
import { StepAddressDefaults } from '@/components/onboarding/step-address-defaults'

export function OnboardingWizard({ appName }: { appName: string }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const stepTitleRef = useRef<HTMLDivElement>(null)

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema) as Resolver<OnboardingValues>,
    mode: 'onBlur',
    defaultValues: {
      companyName: '',
      ownerName: '',
      phone: '',
      email: '',
      website: '',
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
    },
  })

  function focusStepTitle() {
    // On step change, focus the step content area for accessibility
    setTimeout(() => {
      stepTitleRef.current?.focus()
    }, 160)
  }

  async function handleNext() {
    const fields = STEP_FIELDS[currentStep]
    const valid = await form.trigger(fields as (keyof OnboardingValues)[])
    if (valid && currentStep < 3) {
      setCurrentStep((prev) => prev + 1)
      focusStepTitle()
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
      focusStepTitle()
    }
  }

  function handleStepClick(step: number) {
    // Direct jump, no validation (D-04)
    setCurrentStep(step)
    focusStepTitle()
  }

  function handleLogoChange(file: File | null, preview: string | null) {
    // Revoke old preview URL
    if (logoPreview && logoPreview !== preview) {
      URL.revokeObjectURL(logoPreview)
    }
    setLogoFile(file)
    setLogoPreview(preview)
  }

  function handleSkip() {
    startTransition(async () => {
      try {
        const companyName = form.getValues('companyName') || 'My Company'
        const result = await createOrUpdateCompany({ companyName })
        if (result?.error) {
          toast.error(result.error)
        }
      } catch {
        // redirect throws NEXT_REDIRECT, which is expected
      }
    })
  }

  async function handleComplete() {
    // Validate step 3 fields
    const fields = STEP_FIELDS[3]
    const valid = await form.trigger(fields as (keyof OnboardingValues)[])
    if (!valid) return

    // Also validate all steps to be safe
    const allValid = await form.trigger()
    if (!allValid) {
      toast.error('Please fix the errors before completing setup.')
      return
    }

    startTransition(async () => {
      try {
        const values = form.getValues()

        // Upload logo to Supabase Storage if a file was selected
        let logoUrl: string | undefined
        if (logoFile) {
          try {
            const supabase = createClient()

            // First, create or get the company to obtain its ID for the storage path
            // We use the user's auth UID as a temporary path prefix
            const { data: userData } = await supabase.auth.getUser()
            if (userData?.user) {
              const ext = logoFile.name.split('.').pop() || 'png'
              const path = `${userData.user.id}/logo.${ext}`

              try {
                await createStorage(supabase).upload('logos', path, logoFile, {
                  upsert: true,
                })
                // Store the storage path (not public URL) -- bucket is private (Pitfall 2)
                logoUrl = path
              } catch {
                toast.error('Logo upload failed. Your company will be saved without a logo.')
              }
            }
          } catch {
            toast.error('Logo upload failed. Your company will be saved without a logo.')
          }
        }

        const result = await createOrUpdateCompany({
          ...values,
          logoUrl,
        })

        if (result?.error) {
          toast.error(result.error)
          return
        }

        toast.success('Company setup complete')
      } catch {
        // redirect throws NEXT_REDIRECT, which is expected
      }
    })
  }

  return (
    <OnboardingCard
      appName={appName}
      skipAction={
        <Button
          type="button"
          variant="link"
          className="text-muted-foreground"
          onClick={handleSkip}
          disabled={isPending}
        >
          Skip for now
        </Button>
      }
    >
      {/* Step indicator */}
      <StepIndicator
        currentStep={currentStep}
        onStepClick={handleStepClick}
      />

      <Separator className="my-6" />

      {/* Step content with cross-fade */}
      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()}>
          <div
            ref={stepTitleRef}
            tabIndex={-1}
            className="outline-none transition-opacity duration-150 ease-in-out"
          >
            {currentStep === 1 && <StepBusinessInfo form={form} />}
            {currentStep === 2 && (
              <StepBrandIdentity
                form={form}
                logoFile={logoFile}
                logoPreview={logoPreview}
                onLogoChange={handleLogoChange}
              />
            )}
            {currentStep === 3 && <StepAddressDefaults form={form} />}
          </div>

          <Separator className="my-6" />

          {/* Navigation footer */}
          <div className="flex justify-between">
            {currentStep > 1 ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-[44px]"
                onClick={handleBack}
                disabled={isPending}
              >
                Back
              </Button>
            ) : (
              <div />
            )}

            {currentStep < 3 ? (
              <Button
                type="button"
                className="min-h-[44px]"
                onClick={handleNext}
                disabled={isPending}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-[44px]"
                onClick={handleComplete}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Setup
              </Button>
            )}
          </div>
        </form>
      </Form>
    </OnboardingCard>
  )
}
