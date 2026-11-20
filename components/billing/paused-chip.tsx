'use client'

import Link from 'next/link'
import { ChevronRight, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppTranslation } from '@/lib/i18n/use-translation'
import { pausedHref } from '@/components/billing/paused-estimate-sheet'

/**
 * Credits plan 2026-11-20: the project's capture waits for credits. A small
 * chip in the project's top bar (beside the status chip), not a panel: it
 * opens the paused sheet (?paused=<attempt>).
 */
export function PausedChip({
  projectId,
  attemptId,
  className,
}: {
  projectId: string
  attemptId: string
  className?: string
}) {
  const { t } = useAppTranslation()
  return (
    <Link
      href={pausedHref(projectId, attemptId)}
      scroll={false}
      data-testid="paused-chip"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/15 dark:text-amber-400',
        className
      )}
    >
      <PauseCircle className="h-3.5 w-3.5" aria-hidden />
      {t('Paused: out of credits')}
      <ChevronRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
    </Link>
  )
}
