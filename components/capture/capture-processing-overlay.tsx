'use client'

import { useTranslation } from '@/lib/i18n/use-translation'
import { TowerLoader } from '@/components/ui/tower-loader'

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
        className="flex items-center justify-center"
        data-testid="capture-processing-loader"
      >
        <TowerLoader size={1.8} label={t('Loading')} />
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
