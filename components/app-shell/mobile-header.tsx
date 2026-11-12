'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { AppIcon } from '@/components/ui/app-icon'
import { LanguageToggle } from '@/components/app-shell/language-toggle'
import { MobileAccountMenu } from '@/components/app-shell/mobile-account-menu'
import { useTranslation } from '@/lib/i18n/use-translation'

interface MobileHeaderProps {
  branding?: { appName: string; logoUrl: string | null }
  navUser?: { email: string; avatarUrl: string | null } | null
  isDemo?: boolean
  /** Membership companies for the profile dropdown's Companies switcher. */
  memberships?: Array<{ id: string; name: string; logo_url: string | null }>
  activeCompanyId?: string
  isAdmin?: boolean
  userName?: string | null
  /** At least one Academy course is visible (server-computed). */
  academyAvailable?: boolean
  /** Company credit state; shown as the Credits row in the account menu. */
  credits?: { percentUsed: number | null; balance: number }
}

export function MobileHeader({
  branding,
  navUser,
  isDemo,
  memberships = [],
  activeCompanyId = '',
  isAdmin,
  userName = null,
  academyAvailable,
  credits,
}: MobileHeaderProps) {
  const { t } = useTranslation()

  return (
    <header
      data-testid="mobile-header"
      className="@container/mh sticky top-0 z-40 flex items-center justify-between glass border-b border-[var(--glass-border)] px-4 pb-3 pt-[calc(env(safe-area-inset-top,_0px)_+_0.75rem)] md:hidden"
    >
      {/* Left: the app name, fixed on every page. Page context (breadcrumbs,
          titles) lives in the page itself, above its title — never up here.
          The action group is ~120px now that credits and theme moved into the
          account menu, so the name fits every phone; it only hides on a header
          narrower than 260px (container query) rather than overlap the flag. */}
      <Link
        href="/"
        aria-label={branding?.appName ?? 'Xtimator'}
        className="flex min-w-0 shrink items-center gap-2 transition-opacity hover:opacity-80"
      >
        <AppIcon
          logoUrl={branding?.logoUrl}
          appName={branding?.appName}
          className="h-7 w-7 shrink-0"
        />
        <span
          data-testid="mobile-header-app-name"
          className="hidden truncate text-base font-bold tracking-tight text-foreground @[260px]/mh:inline"
        >
          {branding?.appName ?? 'Xtimator'}
        </span>
      </Link>

      {/* Right: language + notifications + account. Credits and the theme
          toggle live inside the account menu on mobile (no room up here). */}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <LanguageToggle />
        <Link
          href="/notifications"
          aria-label={t('Notifications')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Bell className="h-4 w-4" />
        </Link>
        {navUser && (
          <MobileAccountMenu
            navUser={navUser}
            memberships={memberships}
            activeCompanyId={activeCompanyId}
            isAdmin={isAdmin}
            userName={userName}
            isDemo={isDemo}
            academyAvailable={academyAvailable}
            credits={credits}
          />
        )}
      </div>
    </header>
  )
}
