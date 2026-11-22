'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import type { LandingStats } from '@/lib/landing/stats'

export interface TrustStat {
  value: number
  suffix: string
  label: string
}

/**
 * Turns the live stats into the stats to show. A missing, zero or invalid
 * value is dropped; nothing here is ever hard-coded or rounded up.
 */
export function buildTrustStats(stats: LandingStats | null | undefined): TrustStat[] {
  if (!stats) return []
  const out: TrustStat[] = []
  const ok = (n: number | null | undefined): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n > 0
  if (ok(stats.contractors)) out.push({ value: stats.contractors, suffix: '', label: 'Contractors' })
  if (ok(stats.estimatesSent)) out.push({ value: stats.estimatesSent, suffix: '', label: 'Estimates sent' })
  if (ok(stats.medianMinutes)) out.push({ value: stats.medianMinutes, suffix: ' min', label: 'Median time to an estimate' })
  return out
}

function Counter({ value, suffix, inView }: { value: number; suffix: string; inView: boolean }) {
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    if (!inView) return
    const ctrl = animate(0, value, {
      duration: 1.8,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v).toLocaleString()),
    })
    return ctrl.stop
  }, [inView, value])

  return <>{display}{suffix}</>
}

export function TrustBar({ stats }: { stats?: LandingStats | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const items = buildTrustStats(stats)

  if (items.length === 0) return null

  return (
    <div ref={ref} className="trust-bar border-b border-white/5 bg-white/[0.03]">
      <div className="mx-auto flex max-w-6xl flex-row items-center justify-around divide-x divide-white/10 px-4 py-5 sm:py-3 sm:px-8 lg:px-10">
        {items.map(({ value, suffix, label }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <span className="text-[clamp(26px,3.5vw,28px)] font-bold leading-none tracking-tight text-foreground tabular-nums">
              <Counter value={value} suffix={suffix} inView={inView} />
            </span>
            <span className="text-[16px] sm:text-[11px] font-medium text-muted-foreground">{label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
