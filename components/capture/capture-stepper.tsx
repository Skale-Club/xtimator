'use client'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/use-translation'

export const STAGES = ['saving', 'transcribing', 'analyzing', 'generating'] as const
export type StageKey = typeof STAGES[number]
export const STAGE_LABELS: Record<StageKey, string> = {
  saving: 'Saving recording',
  transcribing: 'Transcribing',
  analyzing: 'Analyzing',
  generating: 'Generating estimate',
}

export interface CaptureStepperProps {
  currentStage: StageKey | 'done' | 'idle'
  failedAt?: StageKey
  transcript?: string
}

export function CaptureStepper({ currentStage, failedAt, transcript }: CaptureStepperProps) {
  const { t } = useTranslation()
  const currentIdx =
    currentStage === 'done' ? STAGES.length :
    currentStage === 'idle' ? -1 :
    STAGES.indexOf(currentStage)
  const failedIdx = failedAt ? STAGES.indexOf(failedAt) : -1

  // Global progress bar: % complete based on stage
  const progressPct = currentIdx < 0 ? 0 : Math.round((currentIdx / STAGES.length) * 100)

  return (
    // Phase 71-08: glass hero card surrounding the stepper. backdrop-blur is
    // allowed here because this is a single, post-recording hero element —
    // NOT a list row, NOT the live viewfinder (perf gate respected).
    <Card variant="glass" className="space-y-6 px-6" data-testid="capture-stepper">
      {/* Top progress bar (D-10) — uses brand gradient fill in Phase 71 */}
      <div className="h-1 w-full bg-[var(--glass-bg-light)] rounded-full overflow-hidden">
        <div
          className="h-full gradient-brand transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
          data-testid="capture-progress-bar"
        />
      </div>

      <div className="space-y-3">
        {STAGES.map((s, i) => {
          const status =
            failedIdx === i ? 'failed' :
            i < currentIdx ? 'done' :
            i === currentIdx ? 'active' :
            'pending'
          return (
            <div key={s} className="flex items-center gap-3" data-stage={s} data-status={status}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--glass-border)]">
                {status === 'done' && <Check className="h-4 w-4 text-emerald-500" data-testid={`stage-${s}-done`} />}
                {status === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary" data-testid={`stage-${s}-active`} />}
                {status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" data-testid={`stage-${s}-failed`} />}
                {status === 'pending' && <span className="h-2 w-2 rounded-full bg-muted" data-testid={`stage-${s}-pending`} />}
              </span>
              <span className={status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                {t(STAGE_LABELS[s])}
              </span>
            </div>
          )
        })}
      </div>

      {/* Transcript reveal (D-11) — soft glass tint instead of solid bg-muted */}
      {transcript && (
        <div
          className="rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-light)] p-3 max-h-40 overflow-y-auto"
          data-testid="capture-transcript"
        >
          <p className="text-xs text-muted-foreground mb-1">{t('Transcript')}</p>
          <p className="text-sm whitespace-pre-wrap">{transcript}</p>
        </div>
      )}
    </Card>
  )
}
