'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  aggregateDwellByDevice,
  getEstimateClickPoints,
  getEstimateDocumentForHeatmap,
  getEstimateDwellRows,
  type EngagementClickPoint,
  type EngagementHeatmapDocument,
} from '@/lib/queries/engagement'
import { useTranslation } from '@/lib/i18n/use-translation'

// Same code-split reasoning as components/share/estimate-view.tsx: the public
// recipient page only ever renders ONE template, and this workspace dialog is
// the same — no reason to force both template chunks into the workspace
// bundle just because the heatmap MIGHT show either one.
function DocumentSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6" aria-busy>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

const EstimateDocument = dynamic(
  () => import('./estimate-document').then((m) => m.EstimateDocument),
  { loading: () => <DocumentSkeleton /> }
)

const EstimateDocumentModern = dynamic(
  () => import('@/components/share/estimate-document-modern').then((m) => m.EstimateDocumentModern),
  { loading: () => <DocumentSkeleton /> }
)

interface EngagementHeatmapProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimateId: string
}

type DeviceFilter = 'all' | 'desktop' | 'mobile'
type HeatmapMode = 'clicks' | 'attention'

const ITEM_PREFIX = 'item:'

interface AttentionBox {
  target: string
  kind: 'section' | 'item'
  left: number
  top: number
  width: number
  height: number
  seconds: number
  /** 0..1 - dwell relative to the longest dwell of the same kind. */
  share: number
}

/** m:ss label for a dwell time (compact, drawn inside shaded boxes). */
export function formatDwellLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const BLOB_RADIUS_PX = 28

/**
 * Pure projection helper (Task 3) — re-projects a captured click point onto
 * the CURRENTLY rendered document, whatever its width/height happen to be
 * right now. x is a straight percentage of the rendered width; y rescales by
 * the ratio between the document's rendered height now and its height AT
 * CAPTURE TIME (docH) — this is what keeps the overlay correct across a
 * template swap or a different viewport than the visitor had.
 *
 * Exported standalone (no DOM/canvas dependency) so it's unit-testable
 * without a browser environment.
 */
export function projectClickPoint(
  point: { xPct: number; yPx: number; docH: number },
  renderedWidth: number,
  renderedHeight: number
): { x: number; y: number } {
  const x = (point.xPct / 100) * renderedWidth
  const scale = point.docH > 0 ? renderedHeight / point.docH : 1
  const y = point.yPx * scale
  return { x, y }
}

function drawHeatmapBlobs(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height)
  if (points.length === 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const p of points) {
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, BLOB_RADIUS_PX)
    gradient.addColorStop(0, 'rgba(255,90,0,0.35)')
    gradient.addColorStop(1, 'rgba(255,90,0,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(p.x, p.y, BLOB_RADIUS_PX, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Phase 193 (193-03) Task 3 — click-heatmap overlay. Renders the estimate
 * through the SAME read-only template renderer the public share page uses
 * (EstimateDocument mode="view" for classic, EstimateDocumentModern for
 * modern — selected via the company's estimate_template_style, same
 * registry-driven branch as components/share/estimate-view.tsx), then draws
 * a density canvas absolutely positioned over it. A per-section click-count
 * bar list sits alongside as a coordinate-independent fallback.
 */
export function EngagementHeatmap({ open, onOpenChange, estimateId }: EngagementHeatmapProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState<EngagementHeatmapDocument | null>(null)
  const [points, setPoints] = useState<EngagementClickPoint[]>([])
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all')
  const [mode, setMode] = useState<HeatmapMode>('clicks')
  const [dwellRows, setDwellRows] = useState<Awaited<ReturnType<typeof getEstimateDwellRows>> | null>(null)
  const [boxes, setBoxes] = useState<AttentionBox[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      getEstimateDocumentForHeatmap(supabase, estimateId),
      getEstimateClickPoints(supabase, estimateId),
    ])
      .then(([d, p]) => {
        if (cancelled) return
        setDoc(d)
        setPoints(p)
      })
      .catch(() => {
        // Fail-soft: an empty/unavailable document renders the "no data"
        // path below rather than crashing the dialog (mirrors the empty
        // events state — never throw for a read-only observability panel).
        if (!cancelled) {
          setDoc(null)
          setPoints([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, estimateId])

  // Dwell rows are only fetched the first time the Attention view is opened.
  useEffect(() => {
    if (!open || mode !== 'attention' || dwellRows) return
    let cancelled = false
    getEstimateDwellRows(createClient(), estimateId)
      .then((rows) => {
        if (!cancelled) setDwellRows(rows)
      })
      .catch(() => {
        if (!cancelled) setDwellRows([])
      })
    return () => {
      cancelled = true
    }
  }, [open, mode, dwellRows, estimateId])

  // The device filter applies to dwell too: each session's device comes from
  // its 'view' event (see aggregateDwellByDevice).
  const dwell = useMemo(
    () => (dwellRows ? aggregateDwellByDevice(dwellRows, deviceFilter) : null),
    [dwellRows, deviceFilter]
  )
  const hasDwell =
    !!dwell && (Object.keys(dwell.sectionDwell).length > 0 || Object.keys(dwell.itemDwell).length > 0)

  const measureAttention = useCallback(() => {
    const container = containerRef.current
    if (!container || !dwell) {
      setBoxes([])
      return
    }
    const containerRect = container.getBoundingClientRect()
    const maxSection = Math.max(0, ...Object.values(dwell.sectionDwell))
    const maxItem = Math.max(0, ...Object.values(dwell.itemDwell))
    const next: AttentionBox[] = []
    container.querySelectorAll('[data-track-section]').forEach((el) => {
      const target = el.getAttribute('data-track-section')
      if (!target) return
      const isItem = target.startsWith(ITEM_PREFIX)
      const seconds = isItem ? dwell.itemDwell[target.slice(ITEM_PREFIX.length)] : dwell.sectionDwell[target]
      if (!seconds || seconds <= 0) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return // e.g. the hidden mobile/desktop twin
      const max = isItem ? maxItem : maxSection
      next.push({
        target,
        kind: isItem ? 'item' : 'section',
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
        seconds,
        share: max > 0 ? seconds / max : 0,
      })
    })
    // Sections first so line items are painted on top of their parent block.
    next.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'section' ? -1 : 1))
    setBoxes(next)
  }, [dwell])

  useEffect(() => {
    if (!open || !doc || mode !== 'attention') return
    measureAttention()
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measureAttention())
    observer.observe(container)
    return () => observer.disconnect()
  }, [open, doc, mode, measureAttention])

  const filteredPoints = useMemo(
    () => (deviceFilter === 'all' ? points : points.filter((p) => p.device === deviceFilter)),
    [points, deviceFilter]
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const width = container.clientWidth
    const height = container.scrollHeight
    if (width === 0 || height === 0) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const projected = filteredPoints.map((p) => projectClickPoint(p, width, height))
    drawHeatmapBlobs(ctx, projected, width, height)
  }, [filteredPoints])

  useEffect(() => {
    if (!open || !doc) return
    redraw()
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(container)
    return () => observer.disconnect()
  }, [open, doc, redraw])

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of filteredPoints) {
      const key = p.target ?? t('Unlabeled')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [filteredPoints, t])

  const maxSectionCount = sectionCounts[0]?.[1] ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border p-4 pb-3">
          <DialogTitle>{mode === 'attention' ? t('Attention map') : t('Click heatmap')}</DialogTitle>
          <DialogDescription>
            {mode === 'attention'
              ? t('Darker areas were read for longer across every visit.')
              : t('Warmer areas were clicked more often across every visit.')}
          </DialogDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('Heatmap mode')} className="inline-flex w-fit gap-0.5 rounded-full border border-border bg-muted/40 p-0.5">
            {(['clicks', 'attention'] as const).map((m) => (
              <Button
                key={m}
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-full',
                  mode === m
                    ? 'bg-background text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                )}
              >
                {m === 'clicks' ? t('Clicks') : t('Attention')}
              </Button>
            ))}
          </div>
          <div role="group" aria-label={t('Device filter')} className="inline-flex w-fit gap-0.5 rounded-full border border-border bg-muted/40 p-0.5">
            {(['all', 'desktop', 'mobile'] as const).map((f) => (
              <Button
                key={f}
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={deviceFilter === f}
                onClick={() => setDeviceFilter(f)}
                className={cn(
                  'rounded-full',
                  deviceFilter === f
                    ? 'bg-background text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                )}
              >
                {f === 'all' ? t('All') : f === 'desktop' ? t('Desktop') : t('Mobile')}
              </Button>
            ))}
          </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="min-w-0 flex-1 bg-muted/20">
            <div className="p-4">
              {loading && (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {!loading && !doc && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {t('No document to preview yet.')}
                </p>
              )}
              {!loading && doc && mode === 'attention' && dwell && !hasDwell && (
                <p className="pb-3 text-center text-sm text-muted-foreground">
                  {t('No reading time recorded yet.')}
                </p>
              )}
              {!loading && doc && (
                <div ref={containerRef} className="relative mx-auto max-w-3xl">
                  {doc.templateId === 'modern' ? (
                    <EstimateDocumentModern
                      data={doc.data}
                      company={doc.company}
                      client={doc.client}
                      projectName={doc.projectName}
                      projectType={doc.projectType}
                      language={doc.language}
                      estimateVersion={doc.estimateVersion}
                      estimateSeq={doc.estimateSeq}
                      estimateCreatedAt={doc.estimateCreatedAt}
                    />
                  ) : (
                    <EstimateDocument
                      mode="view"
                      data={doc.data}
                      company={doc.company}
                      client={doc.client}
                      projectName={doc.projectName}
                      projectType={doc.projectType}
                      language={doc.language}
                      estimateVersion={doc.estimateVersion}
                      estimateSeq={doc.estimateSeq}
                      estimateCreatedAt={doc.estimateCreatedAt}
                    />
                  )}
                  {/* Absolutely positioned over the document — pointer-events-none
                      so scroll/selection on the underlying doc is unaffected. */}
                  <canvas
                    ref={canvasRef}
                    className={cn(
                      'pointer-events-none absolute inset-0 h-full w-full',
                      mode === 'attention' && 'invisible'
                    )}
                    aria-hidden="true"
                    data-testid="engagement-heatmap-canvas"
                  />
                  {mode === 'attention' && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      aria-hidden="true"
                      data-testid="engagement-attention-layer"
                    >
                      {boxes.map((box) => (
                        <div
                          key={box.target}
                          data-testid="engagement-attention-box"
                          className="absolute rounded-sm"
                          style={{
                            left: box.left,
                            top: box.top,
                            width: box.width,
                            height: box.height,
                            backgroundColor: `rgba(255,90,0,${(0.06 + 0.34 * box.share).toFixed(3)})`,
                          }}
                        >
                          <span className="absolute right-1 top-1 rounded bg-background/90 px-1 text-[10px] font-medium tabular-nums text-foreground shadow-sm">
                            {formatDwellLabel(box.seconds)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="hidden w-56 shrink-0 flex-col gap-2 overflow-y-auto border-l border-border p-3 md:flex">
            <h3 className="text-xs font-[var(--font-weight-medium)] text-muted-foreground">
              {t('Clicks by section')}
            </h3>
            {sectionCounts.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('No clicks recorded yet.')}</p>
            )}
            {sectionCounts.map(([target, count]) => (
              <div key={target} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground">{target}</span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${maxSectionCount > 0 ? (count / maxSectionCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
