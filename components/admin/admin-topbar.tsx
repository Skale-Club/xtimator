'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { ArrowLeft, LogOut, Loader2 } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { useTranslation } from '@/lib/i18n/use-translation'

interface AdminTopbarProps {
  adminEmail: string
}

export function AdminTopbar({ adminEmail }: AdminTopbarProps) {
  const [isPending, startTransition] = useTransition()
  const { t } = useTranslation()

  return (
    <header className="h-16 flex items-center justify-between border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] px-6 flex-shrink-0 sticky top-0 z-30">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('Back to App')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground hidden sm:block">{adminEmail}</span>
        <button
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          disabled={isPending}
          onClick={() => startTransition(() => signOut())}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {t('Sign Out')}
        </button>
      </div>
    </header>
  )
}
