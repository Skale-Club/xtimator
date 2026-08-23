'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

export function TrialBanner({ daysRemaining }: { daysRemaining: number }) {
  const { t } = useTranslation()

  // Translate-then-replace pattern (see generate-invoice-dialog.tsx): the
  // whole sentence is translated as a unit — not "day"/"days" in isolation —
  // because word order and pluralization rules differ across languages, and
  // a singular/plural source string pair (rather than a naive `!== 1 ? 's' :
  // ''` suffix bolted onto an untranslated sentence) is what a real
  // translation can act on.
  const message =
    daysRemaining === 1
      ? t('Your trial ends in {n} day.').replace('{n}', String(daysRemaining))
      : t('Your trial ends in {n} days.').replace('{n}', String(daysRemaining))

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-sm text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {message}{' '}
        <Link
          href="/settings/billing"
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          {t('Upgrade now')}
        </Link>
      </span>
    </div>
  )
}
