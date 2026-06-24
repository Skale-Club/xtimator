'use client'

import Link from 'next/link'
import { Coins } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

/**
 * Phase 115 (CREDITUI-01) — compact topbar credit balance chip.
 *
 * Shows the remaining credit balance and links to /settings/billing. Balance is
 * fed by the layout's EXISTING companies read (no second query). Never shows
 * token/cost math — credits only.
 */
export function CreditChip({ balance }: { balance: number }) {
  const { t } = useTranslation()
  return (
    <Link
      href="/settings/billing"
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      title={t('Credits')}
      aria-label={t('Credits')}
    >
      <Coins className="h-4 w-4 shrink-0" />
      <span className="font-mono font-medium tabular-nums">{balance.toLocaleString()}</span>
      <span className="hidden text-xs lg:inline">{t('credits')}</span>
    </Link>
  )
}
