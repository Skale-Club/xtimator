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
import type { EstimateAnalyticsContext } from '@/lib/queries/engagement'
import { useTranslation } from '@/lib/i18n/use-translation'
import { EngagementHeatmap } from '../engagement-heatmap'
import { AnalyticsBody, AnalyticsError, AnalyticsSkeleton } from './analytics-content'
import {
  EstimateStatusSummary,
  type EstimateStatusSummaryProps,
} from '@/components/workspace/editor-frame/estimate-status-summary'
import { useIsPhone } from '@/components/ui/use-is-phone'

export interface EstimateAnalyticsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimateId: string
  /** Optional header context. The drawer always looks the rest up (contact, project, total). */
  clientName?: string | null
  estimateNumber?: string | null
  /**
   * The estimate's status (progress line + record the client's answer), shown
   * at the top. The editor passes it so one panel holds status and analytics;
   * surfaces without an editor (dashboard deep links, fixtures) omit it.
   */
  status?: Omit<EstimateStatusSummaryProps, 'estimateId'>
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
  status,
}: EstimateAnalyticsDrawerProps) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({})
  const [context, setContext] = useState<EstimateAnalyticsContext | null>(null)
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
    getEstimateAnalyticsContext(supabase, estimateId)
      .then((ctx) => {
        if (!cancelled) setContext(ctx)
      })
      .catch(() => {
        /* header and follow-up context are cosmetic */
      })
    return () => {
      cancelled = true
    }
  }, [open, estimateId, attempt, status?.clientResponse])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const name = clientName ?? context?.clientName ?? null
  const number = estimateNumber ?? context?.estimateNumber ?? null
  const total = formatTotal(context?.total ?? null, context?.currency ?? null)
  const subtitle =
    [context?.projectName, number ? `#${number}` : null, total].filter(Boolean).join(' · ') ||
    t('How the client engaged with this estimate.')

  const header = (
    <div
      data-sheet-drag=""
      className="flex shrink-0 touch-none items-center justify-between gap-3 border-b border-border/60 py-2 pl-5 pr-3 sm:touch-auto sm:py-4"
    >
      <div className="min-w-0">
        {/* Dialog* parts work under both roots: Sheet is the same Radix Dialog. */}
        <DialogTitle className="truncate text-xl font-semibold leading-tight tracking-tight">
          {name ?? t('Estimate analytics')}
        </DialogTitle>
        <DialogDescription className="mt-0.5 truncate text-[13px]">{subtitle}</DialogDescription>
      </div>
      <BottomSheetCloseButton label={t('Close')} />
    </div>
  )

  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 sm:px-5">
      {status && <EstimateStatusSummary estimateId={estimateId} {...status} />}
      {load.status === 'loading' && <AnalyticsSkeleton />}
      {load.status === 'error' && <AnalyticsError onRetry={retry} />}
      {load.status === 'ready' && (
        <AnalyticsBody
          analytics={load.analytics}
          itemLabels={itemLabels}
          onOpenHeatmap={() => setHeatmapOpen(true)}
          contact={{ name, phone: context?.clientPhone, email: context?.clientEmail }}
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

function formatTotal(total: number | null, currency: string | null): string | null {
  if (total == null) return null
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(total)
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)
  }
}

function DesktopShell({ children }: { children: ReactNode }) {
  return (
    <SheetContent
      side="right"
      showCloseButton={false}
      className="w-full gap-0 overflow-hidden bg-background p-0 backdrop-blur-none sm:max-w-[min(960px,94vw)]"
    >
      {children}
    </SheetContent>
  )
}
