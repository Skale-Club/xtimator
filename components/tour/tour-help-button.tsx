'use client'

import { HelpCircle } from 'lucide-react'
import { useTourContext } from './tour-provider'
import { useTour } from './use-tour'
import { useTranslation } from '@/lib/i18n/use-translation'

export function TourHelpButton() {
  const { showSpotlight, setShowWelcome, setIsReviewMode } = useTourContext()
  const { resetAllTourState, startTour } = useTour()
  const { t } = useTranslation()

  // Hide during spotlight to avoid z-index fight
  if (showSpotlight) return null

  // Full restart-from-scratch:
  //   1. Wipe every `xtimator:tour:v1:*` key so tooltips that have been
  //      dismissed reappear (TOUR-FIX-04 restart contract).
  //   2. Re-arm the spotlight pending flag and reset `completed=false` so
  //      the next render cycle replays from step 1.
  //   3. Re-open the welcome modal in review mode — keeps the owner-requested
  //      "welcome screen reappears" UX from Phase 74.
  function handleClick() {
    resetAllTourState()
    startTour()
    setIsReviewMode(true)
    setShowWelcome(true)
  }

  return (
    <button
      onClick={handleClick}
      aria-label={t('Open app tour')}
      className={[
        'fixed bottom-24 right-4 lg:bottom-6 lg:right-6',
        'z-50 flex items-center justify-center',
        'h-10 w-10 rounded-full',
        'glass-strong border border-[var(--glass-border)] shadow-glass',
        'text-muted-foreground hover:text-foreground',
        'transition-all hover:scale-105 active:scale-95',
      ].join(' ')}
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  )
}
