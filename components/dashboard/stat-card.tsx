'use client'

import { Card } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { T } from '@/components/i18n/t'
import { motion, useReducedMotion } from 'framer-motion'

export type StatTone = 'blue' | 'amber' | 'emerald' | 'violet'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  delta?: string
  className?: string
  index?: number
  /** Accent colour, so the four dashboard numbers read apart at a glance. */
  tone?: StatTone
}

// Full class strings (not built from the tone name) so Tailwind keeps them.
const TONES: Record<StatTone, { chip: string; glow: string; edge: string }> = {
  blue: {
    chip: 'bg-blue-500/12 text-blue-500 ring-blue-500/25',
    glow: 'bg-blue-500/20',
    edge: 'from-blue-500/0 via-blue-500/70 to-blue-500/0',
  },
  amber: {
    chip: 'bg-amber-500/12 text-amber-500 ring-amber-500/25',
    glow: 'bg-amber-500/18',
    edge: 'from-amber-500/0 via-amber-500/70 to-amber-500/0',
  },
  emerald: {
    chip: 'bg-emerald-500/12 text-emerald-500 ring-emerald-500/25',
    glow: 'bg-emerald-500/18',
    edge: 'from-emerald-500/0 via-emerald-500/70 to-emerald-500/0',
  },
  violet: {
    chip: 'bg-violet-500/12 text-violet-500 ring-violet-500/25',
    glow: 'bg-violet-500/20',
    edge: 'from-violet-500/0 via-violet-500/70 to-violet-500/0',
  },
}

/**
 * Compact, content-sized statistics. Labels and full values can wrap, so a
 * longer translation or amount grows the card instead of being clipped.
 */
export function StatCard({ icon: Icon, label, value, delta, className, index = 0, tone = 'blue' }: StatCardProps) {
  const reduce = useReducedMotion()
  const accent = TONES[tone]

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="h-full min-w-0 w-full"
    >
      <Card
        variant="stat"
        className={cn(
          '@container relative isolate flex h-full min-w-0 cursor-default select-none flex-col gap-1.5 overflow-hidden rounded-2xl p-2.5 sm:gap-2.5 sm:p-5',
          className
        )}
      >
        {/* Accent: a hairline across the top edge and a soft glow behind the icon. */}
        <span aria-hidden className={cn('pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r', accent.edge)} />
        <span aria-hidden className={cn('pointer-events-none absolute -left-8 -top-10 -z-10 size-28 rounded-full blur-2xl', accent.glow)} />
        {/* Labels can wrap in any language; all values share the right edge. */}
        <div className="flex min-h-6 items-center gap-2 sm:min-h-8 sm:gap-2.5">
          <div className={cn('flex size-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset sm:size-8', accent.chip)}>
            <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
          </div>
          <span data-slot="stat-label" className="min-w-0 flex-1 text-xs font-medium leading-tight text-muted-foreground [overflow-wrap:anywhere]">
            <T text={label} />
          </span>
        </div>
        <p data-slot="stat-value" className="mt-auto min-w-0 text-right font-sans text-[clamp(1.25rem,19cqw,1.5rem)] font-extrabold leading-none tracking-tight text-foreground tabular-nums [overflow-wrap:anywhere] sm:text-[clamp(1.25rem,19cqw,1.75rem)]">
          {value}
        </p>
        {delta && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs font-semibold text-emerald-500 [overflow-wrap:anywhere]">{delta}</span>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
