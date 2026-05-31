'use client'

import { useTranslation } from '@/lib/i18n/use-translation'

export type CaptureProcessingStage =
  | 'idle'
  | 'saving'
  | 'transcribing'
  | 'analyzing'
  | 'generating'
  | 'done'

export interface CaptureProcessingOverlayProps {
  stage: CaptureProcessingStage
}

export function CaptureProcessingOverlay({ stage }: CaptureProcessingOverlayProps) {
  const { t } = useTranslation()

  // Resolve the status label per stage. Keep raw string literals so the i18n
  // extractor picks them up — do NOT build labels via a Record at render time.
  const label =
    stage === 'saving'       ? t('Saving') :
    stage === 'transcribing' ? t('Transcribing') :
    stage === 'analyzing'    ? t('Analyzing') :
    stage === 'generating'   ? t('Generating estimate') :
    stage === 'done'         ? t('Almost ready') :
                               t('Working...')

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/60 backdrop-blur-sm"
      data-testid="capture-processing-overlay"
    >
      <div
        role="status"
        aria-label={t('Loading')}
        className="flex items-center gap-2"
        data-testid="capture-processing-dots"
      >
        <span
          className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: '-0.3s' }}
        />
        <span
          className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: '-0.15s' }}
        />
        <span
          className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: '0s' }}
        />
      </div>
      <p
        className="text-sm text-muted-foreground"
        data-testid="capture-processing-label"
      >
        {label}
      </p>
    </div>
  )
}
