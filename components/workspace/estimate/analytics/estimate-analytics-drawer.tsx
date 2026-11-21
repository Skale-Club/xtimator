'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import {
  getEstimateAnalytics,
  getEstimateAnalyticsContext,
  getEstimateItemLabels,
} from '@/lib/queries/engagement'
import type { EstimateAnalytics } from '@/lib/estimate/analytics/contracts'
import { useTranslation } from '@/lib/i18n/use-translation'
import { EngagementHeatmap } from '../engagement-heatmap'
import { AnalyticsBody, AnalyticsError, AnalyticsSkeleton } from './analytics-content'
import { useIsPhone } from '@/components/ui/use-is-phone'

export interface EstimateAnalyticsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimateId: string
  /** Optional header context. When both are missing the drawer looks them up. */
  clientName?: string | null
  estimateNumber?: string | null
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; analytics: EstimateAnalytics }

/**
 * Per-estimate analytics: what happened to the estimate and how the client
 * read it. A bottom sheet on phones (drag handle, tall), a wide right-hand
 * sheet on desktop. Fetches lazily on open with the authenticated browser
 * client (RLS-scoped, like the rest of lib/queries/engagement.ts).
 */
export function EstimateAnalyticsDrawer({
  open,
  onOpenChange,
  estimateId,
  clientName,
  estimateNumber,
}: EstimateAnalyticsDrawerProps) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({})
  const [context, setContext] = useState<{ clientName: string | null; estimateNumber: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [heatmapOpen, setHeatmapOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoad({ status: 'loading' })
    const supabase = createClient()
    getEstimateAnalytics(supabase, estimateId)
      .then((analytics) => {
        if (cancelled) return
        setLoad({ status: 'ready', analytics })
        if (Object.keys(analytics.summary.itemDwell).length > 0) {
          getEstimateItemLabels(supabase, estimateId)
            .then((labels) => {
              if (!cancelled) setItemLabels(labels)
            })
            .catch(() => {
              /* item names are cosmetic: items without a name are simply not listed */
            })
        }
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' })
      })
    if (clientName == null && estimateNumber == null) {
      getEstimateAnalyticsContext(supabase, estimateId)
        .then((ctx) => {
          if (!cancelled) setContext(ctx)
        })
        .catch(() => {
          /* header context is cosmetic */
        })
    }
    return () => {
      cancelled = true
    }
  }, [open, estimateId, attempt, clientName, estimateNumber])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const name = clientName ?? context?.clientName ?? null
  const number = estimateNumber ?? context?.estimateNumber ?? null
  const subtitle =
    [name, number ? `#${number}` : null].filter(Boolean).join(' · ') ||
    t('How the client engaged with this estimate.')

  const header = (
    <div
      data-sheet-drag=""
      className="flex shrink-0 touch-none items-center justify-between gap-3 border-b border-border/60 py-2 pl-5 pr-3 sm:touch-auto sm:py-4"
    >
      <div className="min-w-0">
        {/* Dialog* parts work under both roots: Sheet is the same Radix Dialog. */}
        <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">
          {t('Estimate analytics')}
        </DialogTitle>
        <DialogDescription className="mt-0.5 truncate text-[13px]">{subtitle}</DialogDescription>
      </div>
      <BottomSheetCloseButton label={t('Close')} />
    </div>
  )

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 sm:px-5">
      {load.status === 'loading' && <AnalyticsSkeleton />}
      {load.status === 'error' && <AnalyticsError onRetry={retry} />}
      {load.status === 'ready' && (
        <AnalyticsBody
          analytics={load.analytics}
          itemLabels={itemLabels}
          onOpenHeatmap={() => setHeatmapOpen(true)}
        />
      )}
    </div>
  )

  return (
    <>
      {phone ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <BottomSheetContent className="max-sm:h-[90dvh]" desktopClassName="sm:max-w-[600px]">
            {header}
            {body}
          </BottomSheetContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <DesktopShell>
            {header}
            {body}
          </DesktopShell>
        </Sheet>
      )}
      <EngagementHeatmap open={heatmapOpen} onOpenChange={setHeatmapOpen} estimateId={estimateId} />
    </>
  )
}

function DesktopShell({ children }: { children: ReactNode }) {
  return (
    <SheetContent
      side="right"
      showCloseButton={false}
      className="w-full gap-0 overflow-hidden bg-background p-0 backdrop-blur-none sm:max-w-[600px]"
    >
      {children}
    </SheetContent>
  )
}
