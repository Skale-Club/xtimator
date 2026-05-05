'use client'
import { Button } from '@/components/ui/button'

export interface CaptureFailureProps {
  errorMessage: string
  retriesUsed: number    // capped at 2 per D-14
  onRetry?: () => void
  onEditManually?: () => void
}

export function CaptureFailure({ errorMessage, retriesUsed, onRetry, onEditManually }: CaptureFailureProps) {
  const canRetry = !!onRetry && retriesUsed < 2
  return (
    <div className="space-y-3" data-testid="capture-failure">
      <p className="text-sm text-destructive">{errorMessage}</p>
      <div className="flex gap-2">
        {canRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} data-testid="capture-retry">
            Retry ({2 - retriesUsed} left)
          </Button>
        )}
        {onEditManually && (
          <Button variant="default" size="sm" onClick={onEditManually} data-testid="capture-edit-manually">
            Edit manually
          </Button>
        )}
      </div>
    </div>
  )
}
