'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { AppIcon } from '@/components/ui/app-icon'
import { LanguageToggle } from '@/components/app-shell/language-toggle'
import { MobileAccountMenu } from '@/components/app-shell/mobile-account-menu'
import { useCurrentBreadcrumbs } from '@/components/app-shell/breadcrumb-context'
import { useTranslation } from '@/lib/i18n/use-translation'

const PAGE_TITLES: Record<string, string> = {
  '/projects/new': 'New Xtimate',
  '/academy': 'Academy',
}

const PAGE_OWNS_TITLE = new Set(['/dashboard', '/projects', '/clients', '/price-book'])

function getTitleFromPathname(pathname: string): string {
  if (PAGE_OWNS_TITLE.has(pathname)) return ''
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return ''
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path + '/')) return title
  }
  const segments = pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  return last.charAt(0).toUpperCase() + last.slice(1)
}

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
  const pathname = usePathname()
  const { t } = useTranslation()
  const title = getTitleFromPathname(pathname)
  const breadcrumbs = useCurrentBreadcrumbs()

  return (
    <header
      data-testid="mobile-header"
      className="@container/mh sticky top-0 z-40 flex items-center justify-between glass border-b border-[var(--glass-border)] px-4 pb-3 pt-[calc(env(safe-area-inset-top,_0px)_+_0.75rem)] md:hidden"
    >
      {/* Left: Xtimator logo */}
      <div className="flex min-w-0 shrink items-center gap-2">
        <Link
          href="/"
          aria-label={branding?.appName ?? 'Xtimator'}
          className="shrink-0 flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <AppIcon
            logoUrl={branding?.logoUrl}
            appName={branding?.appName}
            className="h-7 w-7"
          />
          {/* Show name only when there are no breadcrumbs/title, to avoid crowding.
              Also only when the header is wide enough (container query): the
              right-hand action group is ~250px, and on <=390px phones the name
              used to overflow its box and paint over the language flag. */}
          {breadcrumbs.length === 0 && !title && (
            <span className="hidden truncate text-base font-bold tracking-tight text-foreground @[380px]/mh:inline">
              {branding?.appName ?? 'Xtimator'}
            </span>
          )}
        </Link>

        {breadcrumbs.length > 0 ? (
          <nav className="flex items-center gap-1.5 text-sm overflow-hidden">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5 shrink-0">
                {i > 0 && <span className="text-muted-foreground">/</span>}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[80px]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground truncate max-w-[100px]">{crumb.label}</span>
                    {crumb.badge !== undefined && (
                      <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                        {crumb.badge}
                      </span>
                    )}
                  </span>
                )}
              </span>
            ))}
          </nav>
        ) : title ? (
          <h1 className="text-base font-semibold tracking-tight truncate">{t(title)}</h1>
        ) : null}
      </div>

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
