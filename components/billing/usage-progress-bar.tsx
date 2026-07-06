'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { usageBandClass } from '@/lib/billing/usage-color'

/**
 * Phase 152 Plan 01 (CREDITUI-03 / CREDITUI-04) — color-escalating usage bar.
 *
 * Wraps the existing shadcn `Progress` primitive (components/ui/progress.tsx,
 * NOT modified) without touching it: the arbitrary-descendant Tailwind
 * selector `[&>[data-slot=progress-indicator]]:bg-[...]` reaches the child
 * Indicator element from the outside, so no `indicatorClassName` prop is
 * needed on `Progress` itself.
 *
 * Bands (152-UI-SPEC.md Color-escalation bands section):
 *   0-69%  healthy -> --success (green)
 *   70-89% warning -> --warning (amber)
 *   90-100% critical -> --danger (red)
 *
 * Props are `{ percentUsed: number }` ONLY — never `balance`, `cycleGrant`, or
 * any dollar figure. This is the structural CREDITUI-04 enforcement point: the
 * raw credit balance never reaches this (or any) client-rendered component.
 *
 * Phase 156 (CREDITFIX-02): usageBandClass extracted to
 * lib/billing/usage-color.ts so the new topbar CreditChip bar reuses the same
 * thresholds instead of duplicating the if/else.
 */

export function UsageProgressBar({ percentUsed }: { percentUsed: number }) {
  return (
    <div className="space-y-1.5" data-testid="usage-progress-bar">
      <Progress value={percentUsed} className={cn('h-2', usageBandClass(percentUsed))} />
      <span className="font-mono text-sm font-medium tabular-nums">{percentUsed}% used</span>
    </div>
  )
}
