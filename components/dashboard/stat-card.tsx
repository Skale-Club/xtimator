'use client'

import { Card } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { T } from '@/components/i18n/t'
import { motion, useReducedMotion } from 'framer-motion'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  delta?: string
  className?: string
  index?: number
}

/**
 * Phase 71 — Stat card using <Card variant="stat">.
 * 3px gradient-brand top edge + glass surface + 16px blur.
 * Modern, compact, horizontal split design with staggered entry animation.
 */
export function StatCard({ icon: Icon, label, value, delta, className, index = 0 }: StatCardProps) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="w-full"
    >
      <Card 
        variant="stat" 
        className={cn(
          'group relative p-4 flex flex-col justify-between transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]', 
          className
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 truncate">
              <T text={label} />
            </span>
            <p className="font-sans text-3xl font-extrabold tracking-tight text-foreground leading-none tabular-nums">
              {value}
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/15 transition-all duration-300 group-hover:scale-105 group-hover:bg-primary/15 group-hover:border-primary/25">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </div>
        </div>
        {delta && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-emerald-500">{delta}</span>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
