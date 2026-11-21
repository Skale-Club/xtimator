'use client'

// Plain SVG / CSS charts for the analytics dashboard. No chart library.

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { fill, shortDate } from './format'
import { DAY_COUNT, type DayBucket } from './analytics-data'

// ---------------------------------------------------------------------------
// Opens per day
// ---------------------------------------------------------------------------

const W = 280
const H = 104
const BASE = 96 // baseline y
const TOP = 6
const COL = W / DAY_COUNT
const BAR_W = 16
const STUB = 3

function opensText(t: (s: string) => string, date: Date, count: number): string {
  return fill(t(count === 1 ? '{date}: 1 open' : '{date}: {n} opens'), {
    date: shortDate(date.toISOString()),
    n: count,
  })
}

export function OpensPerDayChart({ days }: { days: DayBucket[] }) {
  const { t } = useTranslation()
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.count))
  const peak = days.reduce((best, d) => (d.count > best.count ? d : best), days[0])
  const total = days.reduce((sum, d) => sum + d.count, 0)

  const summary = fill(t('Opens per day, last {days} days. {total} in total. Peak: {peak}.'), {
    days: days.length,
    total,
    peak: opensText(t, peak.date, peak.count),
  })

  const left = active == null ? 0 : ((active + 0.5) / days.length) * 100

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={summary}
          data-testid="opens-per-day-chart"
        >
          <line x1={0} x2={W} y1={BASE + 0.5} y2={BASE + 0.5} stroke="hsl(var(--border))" strokeWidth={1} />
          {days.map((d, i) => {
            const x = i * COL + (COL - BAR_W) / 2
            const h = d.count === 0 ? STUB : Math.max(STUB + 2, (d.count / max) * (BASE - TOP))
            const isActive = active === i
            return (
              <g key={d.key}>
                <rect
                  x={x}
                  y={BASE - h}
                  width={BAR_W}
                  height={h}
                  rx={3}
                  fill={d.count === 0 ? 'hsl(var(--muted-foreground) / 0.25)' : 'hsl(var(--primary))'}
                  opacity={active != null && !isActive && d.count > 0 ? 0.55 : 1}
                  data-testid="opens-day-bar"
                  data-count={d.count}
                />
                {/* Full-column hit area: hover, tap and keyboard focus. */}
                <rect
                  x={i * COL}
                  y={0}
                  width={COL}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={opensText(t, d.date, d.count)}
                  data-testid="opens-day-hit"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive((c) => (c === i ? null : c))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((c) => (c === i ? null : c))}
                  onClick={() => setActive((c) => (c === i ? null : i))}
                  className="cursor-default outline-none"
                />
              </g>
            )
          })}
        </svg>
        {active != null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs font-medium tabular-nums text-popover-foreground shadow-md"
            style={{ left: `${Math.min(86, Math.max(14, left))}%` }}
          >
            {opensText(t, days[active].date, days[active].count)}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{shortDate(days[0].date.toISOString())}</span>
        <span>{shortDate(days[days.length - 1].date.toISOString())}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Funnel row
// ---------------------------------------------------------------------------

const FUNNEL_OPACITY = [1, 0.8, 0.65, 0.55, 0.45]

export function FunnelRow({
  label,
  count,
  ratio,
  step,
}: {
  label: string
  count: number
  ratio: number
  step: number
}) {
  return (
    <div
      className="grid grid-cols-[6.75rem_minmax(0,1fr)_1.75rem] items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_1.75rem]"
      data-testid="funnel-row"
    >
      <span className="text-[13px] leading-tight text-foreground">{label}</span>
      <div className="flex h-5 items-center">
        {count > 0 ? (
          <div
            className="h-5 rounded-[5px] bg-primary"
            style={{ width: `${Math.max(4, Math.min(100, ratio * 100))}%`, opacity: FUNNEL_OPACITY[step] ?? 0.45 }}
          />
        ) : (
          <div className="h-5 w-4 rounded-[5px] border border-dashed border-muted-foreground/40" />
        )}
      </div>
      <span className="text-right text-[13px] font-medium tabular-nums">{count}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress ring
// ---------------------------------------------------------------------------

export function ProgressRing({ ratio, className }: { ratio: number; className?: string }) {
  const r = 16
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, ratio))
  return (
    <svg viewBox="0 0 40 40" className={cn('size-10 shrink-0', className)} aria-hidden>
      <circle cx={20} cy={20} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={5} />
      {pct > 0 && (
        <circle
          cx={20}
          cy={20}
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
          transform="rotate(-90 20 20)"
        />
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Two-segment devices bar
// ---------------------------------------------------------------------------

export const COMPUTER_COLOR = 'bg-primary'
export const PHONE_COLOR = 'bg-[#eb6834] dark:bg-[#d95926]'

export function DeviceBar({ computer, phone }: { computer: number; phone: number }) {
  const total = computer + phone
  if (total === 0) return null
  return (
    <div className="flex h-2.5 w-full gap-0.5" aria-hidden data-testid="devices-bar">
      {computer > 0 && <div className={cn('h-full rounded-full', COMPUTER_COLOR)} style={{ flexGrow: computer, flexBasis: 0 }} />}
      {phone > 0 && <div className={cn('h-full rounded-full', PHONE_COLOR)} style={{ flexGrow: phone, flexBasis: 0 }} />}
    </div>
  )
}
