'use client'

import Link from 'next/link'
import { Coins } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

/**
 * Phase 115 (CREDITUI-01) — compact topbar usage chip.
 * Phase 152 (CREDITUI-03 / CREDITUI-04) — rewritten to show a usage percentage
 * instead of a raw credit count.
 *
 * Shows the usage percentage for this billing cycle and links to
 * /settings/billing. percentUsed is computed server-side (app/(app)/layout.tsx
 * via lib/billing/usage-percent.ts) and fed by the layout's EXISTING companies
 * read (no second query). Never shows a raw credit count or cost math.
 */
export function CreditChip({ percentUsed }: { percentUsed: number }) {
  const { t } = useTranslation()
  return (
    <Link
      href="/settings/billing"
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      title={t('Usage')}
      aria-label={t('Usage')}
    >
      <Coins className="h-4 w-4 shrink-0" />
      <span className="font-mono font-medium tabular-nums">{percentUsed}%</span>
      <span className="hidden text-xs lg:inline">{t('used')}</span>
    </Link>
  )
}
