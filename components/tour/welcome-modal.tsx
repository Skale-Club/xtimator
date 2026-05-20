'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Mic, Camera, Sparkles, Send } from 'lucide-react'
import { useTourContext } from './tour-provider'
import { useTour } from './use-tour'
import { useTranslation } from '@/lib/i18n/use-translation'

export function WelcomeModal() {
  const { showWelcome, setShowWelcome, setShowSpotlight, isReviewModeRef, setIsReviewMode } = useTourContext()
  const { completeTour, startTour } = useTour()
  const { t } = useTranslation()

  function handleStartEstimating() {
    completeTour()
    setShowWelcome(false)
  }

  function handleShowMeAround() {
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
      <DialogContent className="glass-strong max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-center">
            {t('Welcome to Xtimator!')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-center text-sm">
          {t("You're set up. Here's how the magic works:")}
        </p>
        <ul className="space-y-3 mt-2">
          {[
            { Icon: Mic,      text: t('Record a job site walkthrough') },
            { Icon: Camera,   text: t('Add photos of the scope') },
            { Icon: Sparkles, text: t('AI generates a complete estimate') },
            { Icon: Send,     text: t('Send as PDF or shareable link') },
          ].map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm">
              <Icon className="h-4 w-4 text-primary shrink-0" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="text-center text-sm font-medium mt-2">
          {t('Ready to create your first estimate?')}
        </p>
        <div className="flex gap-3 mt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleShowMeAround}
          >
            {t('Show me around')}
          </Button>
          {isReviewModeRef.current ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
            >
              {t('Close')}
            </Button>
          ) : (
            <Button
              className="flex-1 gradient-brand text-white"
              onClick={handleStartEstimating}
            >
              {t('Start estimating')} →
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
