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
 * Phase 71 — Stat card using <Card variant="stat">.
 * 3px gradient-brand top edge + glass surface + 16px blur.
 * Modern, compact, horizontal split design with staggered entry animation.
 */
export function StatCard({ icon: Icon, label, value, delta, className, index = 0, tone = 'blue' }: StatCardProps) {
  const reduce = useReducedMotion()
  const accent = TONES[tone]

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="h-full w-full"
    >
      <Card
        variant="stat"
        className={cn(
          '@container relative isolate flex h-full cursor-default select-none flex-col gap-2.5 overflow-hidden rounded-2xl p-3.5 sm:p-5',
          className
        )}
      >
        {/* Accent: a hairline across the top edge and a soft glow behind the icon. */}
        <span aria-hidden className={cn('pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r', accent.edge)} />
        <span aria-hidden className={cn('pointer-events-none absolute -left-8 -top-10 -z-10 size-28 rounded-full blur-2xl', accent.glow)} />
        {/* Label beside the icon (it wraps there instead of being cut, "Estimativas
            pen…"), the number on its own full-width row below, shrinking with the
            card instead of running into anything ($128,450). */}
        <div className="flex min-h-8 items-center gap-2.5">
          <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', accent.chip)}>
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <span className="min-w-0 text-xs font-medium leading-tight text-muted-foreground [overflow-wrap:anywhere]">
            <T text={label} />
          </span>
        </div>
        <p className="mt-auto whitespace-nowrap font-sans text-[clamp(1.25rem,19cqw,1.75rem)] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
          {value}
        </p>
        {delta && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-emerald-500">{delta}</span>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
