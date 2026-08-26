'use client'

import { useEffect, useState } from 'react'
import { Eye, Users, Clock, TrendingUp, Flame, Smartphone, Monitor, MousePointerClick, Loader2 } from 'lucide-react'
import { SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  getEstimateEngagementOverview,
  type EstimateEngagementSummary,
  type EngagementVisit,
} from '@/lib/queries/engagement'
import { relativeTime } from '@/lib/utils/relative-time'
import { useTranslation } from '@/lib/i18n/use-translation'
import { EngagementHeatmap } from './engagement-heatmap'

interface EngagementPanelProps {
  estimateId: string
}

/** mm:ss under an hour, h:mm above — matches the "Total time"/visit-duration
 *  stat cards; no i18n needed (digits + fixed separators only). */
function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m ${String(secs).padStart(2, '0')}s`
}

type InterestLevel = 'hot' | 'warm' | 'none'

/** Pure presentation classifier — no schema, no persistence (per plan 2b). */
function deriveInterestLevel(summary: EstimateEngagementSummary): InterestLevel {
  if (summary.opens === 0) return 'none'
  if (summary.opens >= 3 || summary.uniqueVisitors >= 2 || summary.maxScrollPct >= 100) return 'hot'
  return 'warm'
}

function DeviceIcon({ device }: { device: 'mobile' | 'desktop' | null }) {
  if (device === 'mobile') return <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
  if (device === 'desktop') return <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
  return <Eye className="h-3.5 w-3.5 text-muted-foreground" />
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <Card variant="glass" className="gap-2 py-3">
      <CardContent className="px-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-xs">{label}</span>
        </div>
        <span className="text-lg font-[var(--font-weight-semibold)] tabular-nums">{value}</span>
      </CardContent>
    </Card>
  )
}

/**
 * Phase 193 (193-03) — the Insights Sheet body: stats, visits list, and the
 * entry point into the click-heatmap dialog. Mounted only while the header
 * Sheet (engagement-button.tsx) is open — fetches on mount via the plain
 * authenticated browser client (RLS-scoped, no service role — same posture
 * lib/queries/engagement.ts documents).
 */
export function EngagementPanel({ estimateId }: EngagementPanelProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<EstimateEngagementSummary | null>(null)
  const [visits, setVisits] = useState<EngagementVisit[]>([])
  const [heatmapOpen, setHeatmapOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const supabase = createClient()
    getEstimateEngagementOverview(supabase, estimateId)
      .then(({ summary: s, visits: v }) => {
        if (cancelled) return
        setSummary(s)
        setVisits(v)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [estimateId])

  const interest = summary ? deriveInterestLevel(summary) : 'none'

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t('Estimate insights')}</SheetTitle>
        <SheetDescription>
          {t('How the client engaged with this estimate since it was sent.')}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-4">
        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loading && summary && summary.opens === 0 && (
          <Card variant="glass">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {t('Sent — not opened yet')}
            </CardContent>
          </Card>
        )}

        {!loading && summary && summary.opens > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {summary.lastViewedAt
                  ? t('Last opened') + ' ' + relativeTime(summary.lastViewedAt)
                  : null}
              </span>
              {interest === 'hot' && (
                <Badge variant="danger" className="gap-1">
                  <Flame className="h-3 w-3" />
                  {t('Hot')}
                </Badge>
              )}
              {interest === 'warm' && <Badge variant="secondary">{t('Warm')}</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatCard icon={Eye} label={t('Opens')} value={String(summary.opens)} />
              <StatCard icon={Users} label={t('Unique visitors')} value={String(summary.uniqueVisitors)} />
              <StatCard icon={Clock} label={t('Total time')} value={formatDuration(summary.totalSeconds)} />
              <StatCard
                icon={TrendingUp}
                label={t('Read depth')}
                value={`${Math.round(summary.maxScrollPct)}%`}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setHeatmapOpen(true)}
              disabled={summary.clicks === 0}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              {t('View click heatmap')}
              {summary.clicks > 0 && (
                <span className="text-muted-foreground">({summary.clicks})</span>
              )}
            </Button>

            {visits.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-[var(--font-weight-medium)]">{t('Visits')}</h3>
                <div className="flex flex-col gap-2">
                  {visits.map((visit) => (
                    <div
                      key={visit.sessionId}
                      className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border/50 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <DeviceIcon device={visit.device} />
                        <span className="text-muted-foreground truncate">
                          {relativeTime(visit.startedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span className="tabular-nums">{formatDuration(visit.seconds)}</span>
                        <span className="tabular-nums">{Math.round(visit.maxScrollPct)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <EngagementHeatmap open={heatmapOpen} onOpenChange={setHeatmapOpen} estimateId={estimateId} />
    </>
  )
}
