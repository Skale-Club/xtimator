'use client'

import { HelpCircle } from 'lucide-react'
import { useTourContext } from './tour-provider'
import { useTranslation } from '@/lib/i18n/use-translation'

export function TourHelpButton() {
  const { showSpotlight, setShowWelcome, setIsReviewMode } = useTourContext()
  const { t } = useTranslation()

  // Hide during spotlight to avoid z-index fight
  if (showSpotlight) return null

  function handleClick() {
    setIsReviewMode(true)
    setShowWelcome(true)
  }

  return (
    <button
      onClick={handleClick}
      aria-label={t('Open app tour')}
      className={[
        'fixed bottom-24 right-4 md:bottom-6 md:right-6',
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
