'use client'

import { Check, Circle, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

type StepState = 'done' | 'active' | 'pending'

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (state === 'active') return <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
  return <Circle className="h-5 w-5 text-muted-foreground/40" aria-hidden />
}

/**
 * Working state of "Edit with AI": shown while the pending edits are saved and
 * the server works out the changes. Same row styling as the generation
 * checklist, but with no progress bar or time estimate, because the server
 * does not report progress for a refine.
 */
export function RefineWorking({ phase }: { phase: 'saving' | 'refining' }) {
  const { t } = useTranslation()
  const rows: Array<{ label: string; state: StepState }> = [
    { label: t('Saving your latest edits'), state: phase === 'saving' ? 'active' : 'done' },
    { label: t('Working out the changes'), state: phase === 'saving' ? 'pending' : 'active' },
    { label: t('Comparing with the current estimate'), state: 'pending' },
  ]
  return (
    <div
      className="flex min-h-[196px] w-full flex-1 flex-col gap-3.5 px-5 pt-3 pb-5"
      data-testid="refine-busy"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span
          className="h-[34px] w-[34px] shrink-0 animate-spin rounded-full border-[3px] border-muted border-t-primary"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-base font-semibold leading-snug text-foreground">{t('Preparing the changes')}</p>
          <p className="text-[12.5px] text-muted-foreground">
            {t('Nothing changes in the estimate until you approve')}
          </p>
        </div>
      </div>
      <ol className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            data-state={row.state}
            aria-current={row.state === 'active' ? 'step' : undefined}
            className={`flex items-center gap-3 py-[7px] text-[14.5px] ${
              row.state === 'pending'
                ? 'text-muted-foreground'
                : row.state === 'active'
                  ? 'font-medium text-foreground'
                  : 'text-foreground'
            }`}
          >
            <StepIcon state={row.state} />
            {row.label}
          </li>
        ))}
      </ol>
    </div>
  )
}
