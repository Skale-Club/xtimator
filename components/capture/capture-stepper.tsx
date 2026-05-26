'use client'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { CaptureMode } from '@/components/projects/estimate-creation-popup'

export const STAGES = ['saving', 'transcribing', 'analyzing', 'generating'] as const
export type StageKey = typeof STAGES[number]
export const STAGE_LABELS: Record<StageKey, string> = {
  saving: 'Saving recording',
  transcribing: 'Transcribing',
  analyzing: 'Analyzing',
  generating: 'Generating estimate',
}

// Per-mode stage sequences. Stages that don't apply to a given input mode are
// omitted so the progress UI doesn't claim work that never ran (e.g.
// "Transcribing" when the user typed a description instead of recording).
const STAGES_BY_MODE: Record<CaptureMode, readonly StageKey[]> = {
  audio: ['saving', 'transcribing', 'analyzing', 'generating'],
  text: ['saving', 'generating'],
  photos: ['saving', 'analyzing', 'generating'],
}

const LABELS_BY_MODE: Record<CaptureMode, Partial<Record<StageKey, string>>> = {
  audio: {},
  text: { saving: 'Saving description' },
  photos: { saving: 'Saving photos', analyzing: 'Analyzing photos' },
}

export interface CaptureStepperProps {
  currentStage: StageKey | 'done' | 'idle'
  failedAt?: StageKey
  transcript?: string
  /** Input modality. Determines which stages render. Defaults to `audio`. */
  mode?: CaptureMode
}

export function CaptureStepper({ currentStage, failedAt, transcript, mode = 'audio' }: CaptureStepperProps) {
  const { t } = useTranslation()
  const stages = STAGES_BY_MODE[mode]
  const labelOverrides = LABELS_BY_MODE[mode]

  const currentIdx =
    currentStage === 'done' ? stages.length :
    currentStage === 'idle' ? -1 :
    stages.indexOf(currentStage)
  const failedIdx = failedAt ? stages.indexOf(failedAt) : -1

  // Global progress bar: % complete based on stage
  const progressPct = currentIdx < 0 ? 0 : Math.round((currentIdx / stages.length) * 100)

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
        {stages.map((s, i) => {
          const status =
            failedIdx === i ? 'failed' :
            i < currentIdx ? 'done' :
            i === currentIdx ? 'active' :
            'pending'
          const label = labelOverrides[s] ?? STAGE_LABELS[s]
          return (
            <div key={s} className="flex items-center gap-3" data-stage={s} data-status={status}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--glass-border)]">
                {status === 'done' && <Check className="h-4 w-4 text-emerald-500" data-testid={`stage-${s}-done`} />}
                {status === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary" data-testid={`stage-${s}-active`} />}
                {status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" data-testid={`stage-${s}-failed`} />}
                {status === 'pending' && <span className="h-2 w-2 rounded-full bg-muted" data-testid={`stage-${s}-pending`} />}
              </span>
              <span className={status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                {t(label)}
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
