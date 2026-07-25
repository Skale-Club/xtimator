'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { AppIcon } from '@/components/ui/app-icon'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { LanguageToggle } from '@/components/app-shell/language-toggle'
import { NavUserDropdown } from '@/components/app-shell/nav-user-dropdown'
import { useCurrentBreadcrumbs } from '@/components/app-shell/breadcrumb-context'

const PAGE_TITLES: Record<string, string> = {
  '/projects/new': 'New Xtimate',
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
}

export function MobileHeader({ branding, navUser }: MobileHeaderProps) {
  const pathname = usePathname()
  const title = getTitleFromPathname(pathname)
  const breadcrumbs = useCurrentBreadcrumbs()

  return (
    <header
      data-testid="mobile-header"
      className="sticky top-0 z-40 flex items-center justify-between glass border-b border-[var(--glass-border)] px-4 pb-3 pt-[calc(env(safe-area-inset-top,_0px)_+_0.75rem)] md:hidden"
    >
      {/* Left: Xtimator logo */}
      <div className="flex items-center gap-2 min-w-0 shrink">
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
          {/* Show name only when there are no breadcrumbs/title, to avoid crowding */}
          {breadcrumbs.length === 0 && !title && (
            <span className="text-base font-bold tracking-tight text-foreground">
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
          <h1 className="text-base font-semibold tracking-tight truncate">{title}</h1>
        ) : null}
      </div>

      {/* Right: same actions as desktop topbar */}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <LanguageToggle />
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Bell className="h-4 w-4" />
        </Link>
        <ThemeToggle />
        {navUser && (
          <NavUserDropdown email={navUser.email} avatarUrl={navUser.avatarUrl} />
        )}
      </div>
    </header>
  )
}
