'use client'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

export interface CaptureFailureProps {
  /**
   * Already-friendly, already-t()'d reason string. The state→message mapping
   * lives at the capture-recorder call site (Plan 02) using inline t() ternaries;
   * this component just renders the friendly string (never a raw status code).
   */
  errorMessage: string
  retriesUsed: number    // capped at 2 per D-14
  onRetry?: () => void
  onEditManually?: () => void
}

export function CaptureFailure({ errorMessage, retriesUsed, onRetry, onEditManually }: CaptureFailureProps) {
  const { t } = useTranslation()
  const canRetry = !!onRetry && retriesUsed < 2
  return (
    <div className="space-y-3" data-testid="capture-failure">
      <p className="text-sm text-destructive">{errorMessage}</p>
      <div className="flex gap-2">
        {canRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} data-testid="capture-retry">
            {/* Keep the literal at the call site for the i18n extractor; the
                ({n} left) count stays outside t() so the key stays extractable. */}
            {t('Retry')} ({2 - retriesUsed} left)
          </Button>
        )}
        {onEditManually && (
          <Button variant="default" size="sm" onClick={onEditManually} data-testid="capture-edit-manually">
            {t('Edit manually')}
          </Button>
        )}
      </div>
    </div>
  )
}
