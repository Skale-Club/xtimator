'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { usageBandClass } from '@/lib/billing/usage-color'
import { useTranslation } from '@/lib/i18n/use-translation'
import { formatCredits } from '@/lib/billing/format-usd'

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
 * CREDITFIX-01: `percentUsed` is now NULLABLE. The server (usage-percent.ts
 * call sites) passes null when nothing has actually been granted this cycle
 * yet — rendering a 0%/100% bar in that case would be a lie (there's no
 * denominator to measure against). When null, this renders the raw `balance`
 * instead of a bar, so the owner still sees SOMETHING rather than a
 * meaningless progress element. `balance` is intentionally optional and used
 * ONLY in that fallback path — the non-null path never reads it, keeping the
 * structural CREDITUI-04 enforcement point intact for the normal case.
 *
 * CREDITFIX-05: the bar was a nameless `<progress>` for screen readers — pass
 * `label` (an untranslated English string, translated here via `t()` since
 * this is already a client component) as `aria-label`, and expose the
 * percentage via `aria-valuetext` (Radix already wires aria-valuenow/min/max).
 */

export function UsageProgressBar({
  percentUsed,
  balance,
  label = 'Usage this billing cycle',
}: {
  percentUsed: number | null
  balance?: number
  label?: string
}) {
  const { t } = useTranslation()

  if (percentUsed === null) {
    return (
      <div className="space-y-1.5" data-testid="usage-progress-bar">
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatCredits(balance ?? 0)} {t('credits')}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5" data-testid="usage-progress-bar">
      <Progress
        value={percentUsed}
        aria-label={t(label)}
        aria-valuetext={`${percentUsed}% ${t('used')}`}
        className={cn('h-2', usageBandClass(percentUsed))}
      />
      <span className="font-mono text-sm font-medium tabular-nums">{percentUsed}% used</span>
    </div>
  )
}
