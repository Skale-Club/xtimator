'use client'

import { Check, Circle, Loader2 } from 'lucide-react'
import type {
  CaptureProgressMode,
  ChecklistDetail,
  ChecklistRow,
} from '@/lib/estimate/progress-model'
import { GENERATE_PHASE_LABELS, formatElapsed, rowLabels } from './processing-narration'

type TFn = (key: string) => string

/**
 * Renders one server-reported fact as a sentence. Numbers are interpolated
 * AFTER translation so every literal flows through t() (extractor requirement).
 */
export function checklistDetailText(detail: ChecklistDetail, t: TFn): string {
  switch (detail.kind) {
    case 'photos':
      return `${detail.analyzed} ${t('of')} ${detail.total} ${t('photos analyzed')}`
    case 'drafting_live': {
      const count = `${detail.sections} ${t(detail.sections === 1 ? 'section so far' : 'sections so far')}`
      return detail.titles.length > 0 ? `${count}: ${detail.titles.join(', ')}` : count
    }
    case 'drafted':
      return `${detail.items} ${t('items in')} ${detail.sections} ${t('sections')}`
    case 'to_price':
      return `${detail.candidates} ${t('items to look up')}`
    case 'priced':
      return `${detail.researched} ${t('of')} ${detail.candidates} ${t('prices found')}`
    case 'price_book':
      return t('Every price came from your Price Book')
    case 'second_pass':
      return detail.phase === 'refining'
        ? `${t('Pass')} ${detail.round + 1}`
        : `${t('Pass')} ${detail.round + 1} · ${t(GENERATE_PHASE_LABELS[detail.phase])}`
  }
}

function RowIcon({ state }: { state: ChecklistRow['state'] }) {
  if (state === 'done') {
    return (
      <span className="checklist-pop flex h-5 w-5 items-center justify-center rounded-full bg-primary">
        <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (state === 'active') {
    return <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
  }
  return <Circle className="h-5 w-5 text-muted-foreground/30" aria-hidden />
}

export interface CaptureProgressChecklistProps {
  rows: ChecklistRow[]
  mode: CaptureProgressMode
  t: TFn
}

/**
 * The vertical checklist: every pipeline step and generate sub-phase as a row.
 * Finished rows keep their check, their duration and their fact, so the
 * operator can always see how much is already behind them.
 */
export function CaptureProgressChecklist({ rows, mode, t }: CaptureProgressChecklistProps) {
  return (
    <ol className="w-full space-y-2.5" data-testid="capture-progress-checklist">
      {rows.map((row) => {
        const labels = rowLabels(row.id, mode)
        const label = t(row.state === 'done' ? labels.done : labels.ongoing)
        const detail = row.detail ? checklistDetailText(row.detail, t) : null
        return (
          <li
            key={row.id}
            className="flex items-start gap-3"
            data-testid={`checklist-row-${row.id}`}
            data-state={row.state}
            aria-current={row.state === 'active' ? 'step' : undefined}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              <RowIcon state={row.state} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={
                    row.state === 'done'
                      ? 'text-sm text-foreground/75'
                      : row.state === 'active'
                        ? 'text-sm font-medium text-foreground'
                        : 'text-sm text-muted-foreground/60'
                  }
                  data-testid="checklist-row-label"
                >
                  {label}
                </p>
                {row.durationMs !== null && row.state !== 'pending' && (
                  <span
                    className="shrink-0 text-xs tabular-nums text-muted-foreground/70"
                    data-testid="checklist-row-duration"
                  >
                    {formatElapsed(row.durationMs)}
                  </span>
                )}
              </div>
              {detail && (
                <p
                  className="mt-0.5 truncate text-xs text-muted-foreground"
                  data-testid="checklist-row-detail"
                  title={detail}
                >
                  {detail}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
