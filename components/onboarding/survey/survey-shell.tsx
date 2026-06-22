'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AppIcon } from '@/components/ui/app-icon'
import { SurveyProgress } from './survey-progress'
import { SurveyStep } from './survey-step'
import type { UseSurveyStateReturn } from './use-survey-state'
import { CompanyNameStep } from './steps/company-name-step'
import { OwnerNameStep } from './steps/owner-name-step'
import { PhoneStep } from './steps/phone-step'
import { EmailStep } from './steps/email-step'
import { IndustryStep } from './steps/industry-step'
import { LanguageStep } from './steps/language-step'
import { BrandColorStep } from './steps/brand-color-step'
import { LogoStep } from './steps/logo-step'
import { LocationStep } from './steps/location-step'
import { ReviewStep } from './steps/review-step'

interface SurveyShellProps {
  appName: string
  logoUrl: string | null
  state: UseSurveyStateReturn
  isSubmitting: boolean
  onComplete: () => void
}

export function SurveyShell({
  appName,
  logoUrl,
  state,
  isSubmitting,
  onComplete,
}: SurveyShellProps) {
  const {
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
    isFirst,
    isLast,
    isStepFilled,
    ready,
  } = state

  const stepProps = {
    values,
    setValue,
    logoFile,
    setLogoFile,
    logoPreview,
    setLogoPreview,
    onNext: isLast ? onComplete : goNext,
  }

  function renderStep() {
    switch (currentStep.key) {
      case 'companyName':
        return <CompanyNameStep {...stepProps} />
      case 'ownerName':
        return <OwnerNameStep {...stepProps} />
      case 'phone':
        return <PhoneStep {...stepProps} />
      case 'email':
        return <EmailStep {...stepProps} />
      case 'industry':
        return <IndustryStep {...stepProps} />
      case 'language':
        return (
          <LanguageStep
            value={values.language}
            onChange={(lang) => setValue('language', lang)}
          />
        )
      case 'brandColor':
        return <BrandColorStep {...stepProps} />
      case 'logo':
        return <LogoStep {...stepProps} />
      case 'location':
        return <LocationStep {...stepProps} />
      case 'review':
        return <ReviewStep {...stepProps} />
      default:
        return null
    }
  }

  function handleSkip() {
    // Reset values for the current step's primary field, then advance.
    switch (currentStep.key) {
      case 'ownerName':
        setValue('ownerName', '')
        break
      case 'phone':
        setValue('phone', '')
        break
      case 'email':
        setValue('email', '')
        break
      case 'industry':
        setValue('industries', [])
        setValue('customIndustries', [])
        setValue('prefillPriceBook', false)
        break
      case 'language':
        setValue('language', 'en')
        break
      case 'brandColor':
        // keep default — no skip change
        break
      case 'logo':
        setLogoFile(null)
        setLogoPreview(null)
        break
      case 'location':
        setValue('address', '')
        setValue('city', '')
        setValue('state', '')
        setValue('zip', '')
        break
      default:
        break
    }
    goNext()
  }

  return (
    <>
      {/* Full-width background — outside the centered container */}
      <div aria-hidden className="fixed inset-0 -z-10 gradient-hero" />

      {/* Full-width shell with centered inner content */}
      <div className="relative isolate min-h-screen w-full bg-background">
        <div className="relative isolate mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-6">

          {/* Header: logo + wordmark */}
          <header className="mb-8 flex items-center justify-center gap-2.5">
            <AppIcon logoUrl={logoUrl} appName={appName} className="h-6 w-6" />
            <span className="text-xl font-bold tracking-tight text-foreground">
              {appName}
            </span>
          </header>

          <Card variant="glass" className="mx-auto w-full max-w-2xl">
            <CardContent className="p-6 md:p-10">
              {!ready ? (
                /* Shown for one frame while localStorage is read client-side.
                   Prevents a hydration mismatch from server (step 0) vs client
                   (persisted step N). */
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <SurveyProgress current={stepIndex} total={totalSteps} />

                  <div
                    key={stepIndex}
                    className="mt-6 opacity-100 transition-all duration-150 ease-in-out motion-safe:animate-[surveyFadeIn_150ms_ease-out]"
                  >
                    <SurveyStep
                      label={currentStep.label}
                      helper={currentStep.helper}
                      error={error}
                    >
                      {renderStep()}
                    </SurveyStep>
                  </div>

                  <footer className="mt-8 flex items-center justify-between gap-3 pt-6">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isFirst || isSubmitting}
                      onClick={goBack}
                    >
                      Back
                    </Button>
                    <div className="flex gap-2">
                      {isLast ? (
                        <Button
                          type="button"
                          variant="primary"
                          onClick={onComplete}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Complete setup
                        </Button>
                      ) : (
                        <>
                          {!currentStep.required && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleSkip}
                              disabled={isSubmitting}
                            >
                              Skip
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="primary"
                            onClick={goNext}
                            disabled={(!currentStep.required && !isStepFilled) || isSubmitting}
                          >
                            Next
                          </Button>
                        </>
                      )}
                    </div>
                  </footer>
                </>
              )}
            </CardContent>
          </Card>

          <style jsx>{`
            @keyframes surveyFadeIn {
              from {
                opacity: 0;
                transform: translateX(8px);
              }
              to {
                opacity: 1;
                transform: translateX(0);
              }
            }
          `}</style>
        </div>
      </div>
    </>
  )
}
