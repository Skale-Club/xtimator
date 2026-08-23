'use client'

import Link from 'next/link'
import { Coins } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { usageBandClass } from '@/lib/billing/usage-color'
import { useTranslation } from '@/lib/i18n/use-translation'
import { formatCredits } from '@/lib/billing/format-usd'

/**
 * Phase 115 (CREDITUI-01) — compact topbar usage chip.
 * Phase 152 (CREDITUI-03 / CREDITUI-04) — rewritten to show a usage percentage
 * instead of a raw credit count.
 * Phase 156 (CREDITFIX-02) — added a real visual progress-bar element (was
 * text-only "X% used"), reusing the same color-escalation thresholds as
 * components/billing/usage-progress-bar.tsx via the shared lib/billing/usage-color.ts
 * helper. Bar is a slim inline element (h-1.5, fixed width) sized to fit the
 * existing h-9 compact container — NOT a full-width bar.
 *
 * Shows the usage percentage for this billing cycle and links to
 * /settings/billing. percentUsed is computed server-side (app/(app)/layout.tsx
 * via lib/billing/usage-percent.ts) and fed by the layout's EXISTING companies
 * read (no second query). Never shows a raw credit count or cost math.
 *
 * CREDITFIX-01 exception: `percentUsed` is nullable — when nothing has been
 * granted this cycle yet a percentage has no valid denominator, so no bar is
 * shown; falls back to the raw `balance` instead of a misleading 0%/100% bar.
 */
export function CreditChip({
  percentUsed,
  balance,
}: {
  percentUsed: number | null
  balance?: number
}) {
  const { t } = useTranslation()

  if (percentUsed === null) {
    return (
      <Link
        href="/settings/billing"
        className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        title={t('Credits')}
        aria-label={t('Credits')}
      >
        <Coins className="h-4 w-4 shrink-0" />
        <span className="font-mono font-medium tabular-nums">{formatCredits(balance ?? 0)}</span>
        <span className="hidden text-xs lg:inline">{t('credits')}</span>
      </Link>
    )
  }

  return (
    <Link
      href="/settings/billing"
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      title={t('Usage')}
      aria-label={t('Usage')}
    >
      <Coins className="h-4 w-4 shrink-0" />
      <Progress
        value={percentUsed}
        className={cn('h-1.5 w-10 sm:w-14', usageBandClass(percentUsed))}
      />
      <span className="font-mono font-medium tabular-nums">{percentUsed}%</span>
      <span className="hidden text-xs lg:inline">{t('used')}</span>
    </Link>
  )
}
