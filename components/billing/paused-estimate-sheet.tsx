'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { useAppTranslation } from '@/lib/i18n/use-translation'
import { CapturePaused, pausedSubtitle } from '@/components/capture/capture-paused'
import { CaptureProcessingOverlay } from '@/components/capture/capture-processing-overlay'
import { getAttemptOutcome } from '@/lib/actions/attempt-outcome'
import { getCurrentEstimateId, pollEstimateOutcome, type StageProgress } from '@/lib/estimate/poll-outcome'
import type { CaptureProgressMode } from '@/lib/estimate/progress-model'

/**
 * Credits plan 2026-11-20 - the ONE place a paused capture is handled outside
 * the live capture: the same sheet as New Xtimate (bottom sheet on phones),
 * opened by `?paused=<attemptId>` on the project page. The project chip, the
 * list badge and the pause email all link here. It shows the paused screen
 * (what is done, where it stopped, the packs); after a buy it shows the same
 * progress checklist as a capture until the estimate is ready, then opens it.
 */

export const PAUSED_PARAM = 'paused'

export function pausedHref(projectId: string, attemptId: string) {
  return `/projects/${projectId}?${PAUSED_PARAM}=${encodeURIComponent(attemptId)}`
}

type View =
  | { kind: 'loading' }
  | { kind: 'paused'; next: 'analyze' | 'generate_estimate'; expiresAt: string | null; completedSteps: string[] }
  | { kind: 'working' }
  | { kind: 'ended'; message: string }

type Progress = {
  completedSteps: string[]
  activeStep: string | null
  activeStepStartedAt: string | null
  stepTimings?: StageProgress['stepTimings']
  phaseVisits?: StageProgress['phaseVisits']
  analyzedCount?: number
  totalCount?: number
  failedCount?: number
}

const EMPTY: Progress = { completedSteps: [], activeStep: null, activeStepStartedAt: null }

export function PausedEstimateSheet() {
  const { t } = useAppTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const attemptId = searchParams.get(PAUSED_PARAM)
  const projectId = /^\/projects\/([^/]+)/.exec(pathname ?? '')?.[1] ?? null
  const open = Boolean(attemptId && projectId)

  const [view, setView] = useState<View>({ kind: 'loading' })
  const [progress, setProgress] = useState<Progress>(EMPTY)
  const [mode, setMode] = useState<CaptureProgressMode>('text')
  const abortRef = useRef<AbortController | null>(null)

  const close = useCallback(() => {
    abortRef.current?.abort()
    const params = new URLSearchParams(searchParams.toString())
    params.delete(PAUSED_PARAM)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? '/'), { scroll: false })
  }, [pathname, router, searchParams])

  // Read the attempt when the sheet opens.
  useEffect(() => {
    if (!open || !attemptId) return
    let cancelled = false
    setView({ kind: 'loading' })
    setProgress(EMPTY)
    void getAttemptOutcome(attemptId).then((outcome) => {
      if (cancelled) return
      if (outcome.state === 'paused') {
        setMode(outcome.completedSteps.includes('transcribe') ? 'audio' : outcome.next === 'analyze' ? 'photos' : 'text')
        setView({ kind: 'paused', next: outcome.next, expiresAt: outcome.expiresAt, completedSteps: outcome.completedSteps })
      } else if (outcome.state === 'pending') {
        setView({ kind: 'working' })
        void watch()
      } else if (outcome.state === 'completed') {
        router.push(`/projects/${projectId}?tab=estimate&estimate=${outcome.estimateId}`)
      } else {
        setView({ kind: 'ended', message: t('This estimate is no longer paused.') })
      }
    })
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attemptId])

  const watch = useCallback(async () => {
    if (!attemptId || !projectId) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const previousEstimateId = await getCurrentEstimateId(projectId).catch(() => null)
    const onStageProgress = (p: StageProgress) =>
      setProgress({
        completedSteps: p.completedSteps,
        activeStep: p.lastStep && !p.completedSteps.includes(p.lastStep) ? p.lastStep : null,
        activeStepStartedAt: p.activeStepStartedAt,
        stepTimings: p.stepTimings,
        phaseVisits: p.phaseVisits,
        analyzedCount: p.analyzedCount,
        totalCount: p.totalCount,
        failedCount: p.failedCount,
      })
    try {
      let outcome = await pollEstimateOutcome({ projectId, previousEstimateId, signal: ctrl.signal, attemptId, onStageProgress })
      // Right after a buy the grant may still be on its way to the paused run.
      for (let i = 0; i < 24 && outcome.state === 'paused'; i++) {
        await new Promise((r) => setTimeout(r, 2500))
        if (ctrl.signal.aborted) return
        outcome = await pollEstimateOutcome({ projectId, previousEstimateId, signal: ctrl.signal, attemptId, onStageProgress })
      }
      if (outcome.state === 'completed') {
        router.push(`/projects/${projectId}?tab=estimate&estimate=${outcome.estimateId}`)
        router.refresh()
      } else if (outcome.state === 'paused') {
        setView({ kind: 'paused', next: outcome.next, expiresAt: outcome.expiresAt, completedSteps: outcome.completedSteps })
      } else if (outcome.state === 'awaiting_details') {
        close()
        router.refresh()
      } else if (outcome.state === 'failed') {
        setView({ kind: 'ended', message: outcome.reason })
      } else {
        setView({ kind: 'ended', message: t('It keeps generating in the background and we will let you know when it is ready.') })
      }
    } catch {
      /* aborted */
    }
  }, [attemptId, projectId, router, close, t])

  const onPurchased = useCallback(() => {
    setView({ kind: 'working' })
    void watch()
  }, [watch])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <BottomSheetContent className="nx-surface" desktopClassName="sm:max-w-[520px]" data-testid="paused-estimate-sheet">
        <DialogHeader data-sheet-drag="" className="flex shrink-0 flex-row items-start justify-between gap-4 pb-3 pl-6 pr-4 pt-2 text-left touch-none sm:pl-7 sm:pr-5 sm:pt-6">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">
              {view.kind === 'working' ? t('Continuing your estimate') : t('Estimate paused')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {view.kind === 'paused'
                ? pausedSubtitle(t, view.expiresAt)
                : view.kind === 'working'
                  ? t('Credits received. It picks up where it stopped.')
                  : ''}
            </DialogDescription>
          </div>
          <BottomSheetCloseButton label={t('Close')} />
        </DialogHeader>
        <div className="overflow-y-auto pb-6 sm:pb-7">
          {view.kind === 'loading' && (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          )}
          {view.kind === 'paused' && (
            <CapturePaused
              withHeader={false}
              next={view.next}
              completedSteps={view.completedSteps}
              expiresAt={view.expiresAt}
              hasAudio={view.completedSteps.includes('transcribe')}
              hasPhotos={view.next === 'analyze' || view.completedSteps.includes('analyze')}
              onPurchased={onPurchased}
            />
          )}
          {view.kind === 'working' && (
            <div className="px-6 sm:px-7">
              <CaptureProcessingOverlay
                layout="inline"
                stage="generating"
                mode={mode}
                completedSteps={progress.completedSteps}
                activeStep={progress.activeStep}
                activeStepStartedAt={progress.activeStepStartedAt}
                analyzedCount={progress.analyzedCount}
                totalCount={progress.totalCount}
                failedCount={progress.failedCount}
                stepTimings={progress.stepTimings}
                phaseVisits={progress.phaseVisits}
                showLeaveHint
                onContinueInBackground={close}
              />
            </div>
          )}
          {view.kind === 'ended' && (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground sm:px-7">{view.message}</p>
          )}
        </div>
      </BottomSheetContent>
    </Dialog>
  )
}
