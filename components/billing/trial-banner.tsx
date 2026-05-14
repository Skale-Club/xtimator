import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export function TrialBanner({ daysRemaining }: { daysRemaining: number }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-sm text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        Your trial ends in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}.{' '}
        <Link
          href="/settings/billing"
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          Upgrade now
        </Link>
      </span>
    </div>
  )
}
