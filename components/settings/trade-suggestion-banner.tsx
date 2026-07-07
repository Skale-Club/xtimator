'use client'

import { useState, useTransition } from 'react'
import { Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { applyTradeSuggestion, dismissTradeSuggestion } from '@/lib/actions/settings'

export interface TradeSuggestionBannerProps {
  suggestedTrade: string
  occurrences: number
}

/**
 * QUICK-psh-03 — Settings -> Company one-tap suggestion: surfaces when >= 3 of
 * the last 5 kept generations detected a trade that differs from the
 * configured companies.industry (lib/queries/company.ts getTradeSuggestion).
 * Apply updates companies.industry; Dismiss stamps
 * trade_suggestion_dismissed_at so the SAME pattern doesn't reappear (a fresh
 * mismatch pattern later still can).
 *
 * The dynamic trade name is kept OUTSIDE the t() literals (extractor
 * requirement — mirrors CaptureFailure's "({n} left)" pattern) so both static
 * sentence fragments stay individually extractable.
 */
export function TradeSuggestionBanner({ suggestedTrade, occurrences }: TradeSuggestionBannerProps) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (dismissed) return null

  function handleApply() {
    startTransition(async () => {
      const result = await applyTradeSuggestion(suggestedTrade)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Primary trade updated.'))
        setDismissed(true)
      }
    })
  }

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissTradeSuggestion()
      if (result.error) {
        toast.error(result.error)
      } else {
        setDismissed(true)
      }
    })
  }

  return (
    <Alert data-testid="trade-suggestion-banner">
      <Lightbulb />
      <AlertTitle>
        {t('Most of your recent estimates were')} <span className="font-semibold">{suggestedTrade}</span>{' '}
        {t('work — make it your primary trade?')}
      </AlertTitle>
      <AlertDescription>
        <p>
          {occurrences} {t('of your last 5 estimates were')} {suggestedTrade} {t('work.')}
        </p>
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            onClick={handleApply}
            disabled={isPending}
            data-testid="trade-suggestion-apply"
          >
            {t('Apply')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDismiss}
            disabled={isPending}
            data-testid="trade-suggestion-dismiss"
          >
            {t('Dismiss')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
