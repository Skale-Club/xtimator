'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Mic, Camera, Sparkles, Send, ArrowRight } from 'lucide-react'
import { GradientTopLine } from '@/components/auth/owned-auth-dialog'
import { useTourContext } from './tour-provider'
import { useTour } from './use-tour'
import { useTranslation } from '@/lib/i18n/use-translation'
import { logTourEvent } from '@/lib/actions/tour'

export function WelcomeModal() {
  const { showWelcome, setShowWelcome, setShowSpotlight, isReviewModeRef, setIsReviewMode } = useTourContext()
  const { completeTour, startTour } = useTour()
  const { t } = useTranslation()

  function handleStartEstimating() {
    completeTour()
    setShowWelcome(false)
  }

  function handleShowMeAround() {
    void logTourEvent('tour_started')
    startTour()            // sets the namespaced spotlight pending flag in localStorage
    setIsReviewMode(false) // leaving modal via spotlight — clear review mode
    setShowWelcome(false)
    setShowSpotlight(true) // Wave 2 spotlight reads this context value
  }

  function handleClose() {
    // IMPORTANT: do NOT call completeTour() here — review mode must not touch localStorage
    setIsReviewMode(false)
    setShowWelcome(false)
  }

  const steps = [
    { Icon: Mic, text: t('Record a job site walkthrough') },
    { Icon: Camera, text: t('Add photos of the scope') },
    { Icon: Sparkles, text: t('AI generates a complete estimate') },
    { Icon: Send, text: t('Send as PDF or shareable link') },
  ]

  return (
    <Dialog
      open={showWelcome}
      onOpenChange={(open) => {
        if (!open) {
          if (isReviewModeRef.current) {
            // Review mode: just close, no localStorage side-effects
            setIsReviewMode(false)
            setShowWelcome(false)
          } else {
            // First-time flow: X button = same as "Start estimating"
            handleStartEstimating()
          }
        }
      }}
    >
      <DialogContent className="w-[92%] max-w-[420px] gap-0 overflow-hidden rounded-2xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-7">
        <GradientTopLine />

        <div className="relative flex flex-col items-center text-center">
          <div className="gradient-brand flex size-12 items-center justify-center rounded-2xl text-white shadow-[0_10px_30px_hsl(var(--primary)/0.35)]">
            <Sparkles className="size-6" aria-hidden />
          </div>
          <DialogTitle className="mt-4 text-2xl font-semibold tracking-tight">
            {t('Welcome to Xtimator!')}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
            {t("You're set up. Here's how the magic works:")}
          </DialogDescription>
        </div>

        <ol className="relative mt-6 space-y-1">
          {steps.map(({ Icon, text }, index) => (
            <li key={text} className="relative flex items-center gap-3.5 py-2">
              {index < steps.length - 1 && (
                <span aria-hidden className="absolute left-[19px] top-[44px] h-[calc(100%-32px)] w-px bg-border" />
              )}
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col text-left">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t('Step')} {index + 1}
                </span>
                <span className="text-sm font-medium leading-snug">{text}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-2">
          {isReviewModeRef.current ? (
            <Button variant="outline" className="min-h-11 w-full" onClick={handleClose}>
              {t('Close')}
            </Button>
          ) : (
            <Button className="gradient-brand min-h-11 w-full text-white" onClick={handleStartEstimating}>
              {t('Start estimating')}
              <ArrowRight className="ml-1.5 size-4" aria-hidden />
            </Button>
          )}
          <Button variant="ghost" className="min-h-11 w-full text-muted-foreground hover:text-foreground" onClick={handleShowMeAround}>
            {t('Show me around')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
