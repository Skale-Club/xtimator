'use client'
import { Check, Loader2, AlertCircle } from 'lucide-react'

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
  const currentIdx =
    currentStage === 'done' ? STAGES.length :
    currentStage === 'idle' ? -1 :
    STAGES.indexOf(currentStage)
  const failedIdx = failedAt ? STAGES.indexOf(failedAt) : -1

  // Global progress bar: % complete based on stage
  const progressPct = currentIdx < 0 ? 0 : Math.round((currentIdx / STAGES.length) * 100)

  return (
    <div className="space-y-6" data-testid="capture-stepper">
      {/* Top progress bar (D-10) */}
      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-[width] duration-500"
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
              <span className="flex h-6 w-6 items-center justify-center rounded-full border">
                {status === 'done' && <Check className="h-4 w-4 text-emerald-500" data-testid={`stage-${s}-done`} />}
                {status === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary" data-testid={`stage-${s}-active`} />}
                {status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" data-testid={`stage-${s}-failed`} />}
                {status === 'pending' && <span className="h-2 w-2 rounded-full bg-muted" data-testid={`stage-${s}-pending`} />}
              </span>
              <span className={status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                {STAGE_LABELS[s]}
              </span>
            </div>
          )
        })}
      </div>

      {/* Transcript reveal (D-11) */}
      {transcript && (
        <div
          className="rounded-md border bg-muted/50 p-3 max-h-40 overflow-y-auto"
          data-testid="capture-transcript"
        >
          <p className="text-xs text-muted-foreground mb-1">Transcript</p>
          <p className="text-sm whitespace-pre-wrap">{transcript}</p>
        </div>
      )}
    </div>
  )
}
