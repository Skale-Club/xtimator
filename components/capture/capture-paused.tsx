'use client'

import { Check, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppTranslation } from '@/lib/i18n/use-translation'
import { BuyCreditsInline } from '@/components/billing/buy-credits'

/**
 * Credits plan 2026-11-20 - a capture paused between steps because the
 * credits ran out (lib/inngest/credit-pause.ts). Same visual family as the
 * New Xtimate popup: the progress checklist (done steps in the primary ring,
 * the stop in amber), then the packs and the gradient pill. A buy resumes the
 * run, which reuses everything already done.
 *
 * `withHeader` off: the surrounding sheet renders the title (paused sheet).
 */
export function CapturePaused({
  next,
  completedSteps,
  expiresAt,
  hasAudio,
  hasPhotos,
  onPurchased,
  withHeader = true,
}: {
  next: 'analyze' | 'generate_estimate'
  completedSteps: string[]
  expiresAt: string | null
  hasAudio: boolean
  hasPhotos: boolean
  onPurchased: () => void
  withHeader?: boolean
}) {
  const { t } = useAppTranslation()

  const steps: Array<{ key: string; label: string }> = [
    ...(hasAudio ? [{ key: 'transcribe', label: t('Transcribe the audio') }] : []),
    ...(hasPhotos || next === 'analyze' ? [{ key: 'analyze', label: t('Analyze the photos') }] : []),
    { key: 'generate_estimate', label: t('Generate the estimate') },
  ]
  const nextIndex = steps.findIndex((s) => s.key === next)

  return (
    <div data-testid="capture-paused" className="flex w-full flex-col gap-6 px-6 pb-1 pt-3 sm:px-7">
      {withHeader && <PausedIntro expiresAt={expiresAt} />}

      <ol className="space-y-3" aria-label={t('Progress')}>
        {steps.map((s, i) => {
          const done = completedSteps.includes(s.key) || i < nextIndex
          const paused = i === nextIndex
          return (
            <li key={s.key} data-state={done ? 'done' : paused ? 'paused' : 'todo'} className="flex items-center gap-3">
              {done ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} aria-hidden />
                </span>
              ) : paused ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 shadow-[0_0_0_4px_hsl(38_92%_50%/0.15)]">
                  <Pause className="h-2.5 w-2.5 fill-white text-white" strokeWidth={3} aria-hidden />
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/25" aria-hidden />
              )}
              <span
                className={cn(
                  'flex-1 text-[15px] leading-tight',
                  done && 'text-muted-foreground',
                  paused && 'font-semibold text-foreground',
                  !done && !paused && 'text-muted-foreground/60'
                )}
              >
                {s.label}
              </span>
              {paused && (
                <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
                  {t('stopped here')}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="border-t border-border pt-5">
        <BuyCreditsInline ctaVerb="continue" onPurchased={onPurchased} />
      </div>
    </div>
  )
}

/** Title + the saved-until line, for surfaces without their own header. */
export function PausedIntro({ expiresAt }: { expiresAt: string | null }) {
  const { t } = useAppTranslation()
  return (
    <div>
      <p className="text-[19px] font-semibold leading-tight tracking-tight">{t('Estimate paused')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{pausedSubtitle(t, expiresAt)}</p>
    </div>
  )
}

export function pausedSubtitle(t: (k: string) => string, expiresAt: string | null): string {
  const until = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null
  return until
    ? t('You ran out of credits. What was already done is saved until {date}.').replace('{date}', until)
    : t('You ran out of credits. What was already done is saved.')
}
