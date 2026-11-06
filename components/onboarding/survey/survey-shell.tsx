'use client'

import { Loader2 } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'
import '@/lib/visual-viewport'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AppIcon } from '@/components/ui/app-icon'
import { SurveyProgress } from './survey-progress'
import { SurveyStep } from './survey-step'
import type { UseSurveyStateReturn } from './use-survey-state'
import { CompanyNameStep } from './steps/company-name-step'
import { IndustryStep } from './steps/industry-step'
import { LanguageStep } from './steps/language-step'
import { BrandColorStep } from './steps/brand-color-step'
import { LogoStep } from './steps/logo-step'
import { LocationStep } from './steps/location-step'

interface SurveyShellProps {
  appName: string
  logoUrl: string | null
  state: UseSurveyStateReturn
  isSubmitting: boolean
  onComplete: () => void
  completionDisabled?: boolean
  draftStatus?: 'saving' | 'saved' | 'error'
  onRetrySave?: () => void
}

export function SurveyShell({
  appName,
  logoUrl,
  state,
  isSubmitting,
  onComplete,
  completionDisabled = false,
  draftStatus,
  onRetrySave,
}: SurveyShellProps) {
  const { t } = useTranslation()
  const stepContent = useRef<HTMLDivElement>(null)
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
    onNext: isLast ? onComplete : () => goNext(),
  }

  useLayoutEffect(() => {
    if (!ready || !stepContent.current) return
    stepContent.current.scrollTop = 0
    const textStep = ['companyName', 'location'].includes(currentStep.key)
    const target = textStep
      ? stepContent.current.querySelector<HTMLInputElement>('input:not([type="file"]):not([type="checkbox"]):not([type="radio"])')
      : stepContent.current.querySelector<HTMLHeadingElement>('h1')
    target?.focus({ preventScroll: true })
    const container = stepContent.current
    // The keyboard resizes only the visual viewport on mobile. Keep the active
    // field inside the scrolling question area, above the stationary actions.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const active = document.activeElement
      if (!(active instanceof HTMLInputElement) || !container.contains(active)) return
      const field = active.getBoundingClientRect()
      const bounds = container.getBoundingClientRect()
      if (field.bottom > bounds.bottom - 12) container.scrollTop += field.bottom - bounds.bottom + 12
      else if (field.top < bounds.top + 12) container.scrollTop -= bounds.top - field.top + 12
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [ready, stepIndex, currentStep.key])

  function renderStep() {
    switch (currentStep.key) {
      case 'companyName':
        return <CompanyNameStep {...stepProps} />
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
      default:
        return null
    }
  }

  function handleSkip() {
    // Reset values for the current step's primary field, then advance.
    switch (currentStep.key) {
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
      case 'location':
        setValue('city', '')
        break
      default:
        break
    }
    goNext({ skipValidation: true })
  }

  return (
    <>
      {/* Full-width background — outside the centered container */}
      <div aria-hidden className="fixed inset-0 -z-10 gradient-hero" />

      {/* Full-width shell with centered inner content */}
      <div data-onboarding-shell className="fixed inset-x-0 isolate w-full overflow-hidden bg-background" style={{ top: 'var(--app-vv-top, 0px)', height: 'var(--app-vvh, 100dvh)' }}>
        <div className="relative isolate mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">

          {/* Header: logo + wordmark */}
          <header data-onboarding-header className="flex shrink-0 items-center justify-center gap-3">
            <AppIcon logoUrl={logoUrl} appName={appName} className="h-10 w-10" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {appName}
            </span>
          </header>

          <Card variant="glass" className="mx-auto flex min-h-0 w-full max-w-2xl flex-col gap-0 overflow-hidden py-0">
            <CardContent className="flex min-h-0 flex-col px-0">
              {!ready ? (
                /* Shown for one frame while localStorage is read client-side.
                   Prevents a hydration mismatch from server (step 0) vs client
                   (persisted step N). */
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="shrink-0 px-6 pt-6 md:px-10 md:pt-8"><SurveyProgress current={stepIndex} total={totalSteps} /></div>

                  <div
                    key={stepIndex}
                    ref={stepContent}
                    className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 pt-5 opacity-100 transition-opacity duration-150 ease-in-out motion-safe:animate-[surveyFadeIn_150ms_ease-out] md:px-10"
                  >
                    <SurveyStep
                      label={currentStep.label}
                      helper={currentStep.helper}
                      error={error}
                    >
                      {renderStep()}
                    </SurveyStep>
                  </div>

                  <footer data-onboarding-actions className="shrink-0 border-t border-border/60 bg-card px-4 py-4 min-[360px]:px-6 md:px-10">
                    <div className="flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isFirst || isSubmitting}
                      onClick={goBack}
                      className="min-h-11 px-3 min-[360px]:px-4"
                    >
                      {t('Back')}
                    </Button>
                    <div className="flex gap-2">
                      {isLast ? (
                        <Button
                          type="button"
                          variant="primary"
                          onClick={onComplete}
                          disabled={isSubmitting || completionDisabled}
                          className="min-h-11 px-3 min-[360px]:px-4"
                        >
                          {isSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {t(isSubmitting ? 'Saving...' : 'Start using Xtimator')}
                        </Button>
                      ) : (
                        <>
                          {!currentStep.required && currentStep.key !== 'language' && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleSkip}
                              disabled={isSubmitting}
                              className="min-h-11 px-3 min-[360px]:px-4"
                            >
                              {t('Skip')}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => goNext()}
                            disabled={(!currentStep.required && !isStepFilled) || isSubmitting}
                            className="min-h-11 px-3 min-[360px]:px-4"
                          >
                            {t('Next')}
                          </Button>
                        </>
                      )}
                    </div>
                    </div>
                    {draftStatus ? <p role="status" className="mt-2 text-center text-xs text-muted-foreground">
                      {t(draftStatus === 'saved' ? 'Draft saved' : draftStatus === 'saving' ? 'Saving draft...' : 'Saved on this device. We’ll retry syncing.')}
                      {draftStatus === 'error' && onRetrySave ? <button type="button" onClick={onRetrySave} className="ml-2 min-h-8 text-primary underline">{t('Retry')}</button> : null}
                    </p> : null}
                  </footer>
                </>
              )}
            </CardContent>
          </Card>

          <style>{`
            html[data-keyboard='open'] [data-onboarding-header] {
              display: none;
            }
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
