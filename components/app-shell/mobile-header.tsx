'use client'

import { usePathname } from 'next/navigation'
import { UserCircle } from 'lucide-react'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { useCurrentBreadcrumbs } from '@/components/app-shell/breadcrumb-context'
import { useTranslation } from '@/lib/i18n/use-translation'
import Link from 'next/link'

const PAGE_TITLES: Record<string, string> = {
  '/projects/new': 'New Xtimate',
}

// Top-level pages reached from the bottom bar render their own heading on the
// page (via <PageHeading>), so the navbar shows no title for them.
const PAGE_OWNS_TITLE = new Set(['/dashboard', '/projects', '/clients', '/price-book'])

function getTitleFromPathname(pathname: string): string {
  if (PAGE_OWNS_TITLE.has(pathname)) return ''
  // Settings renders its own "Profile" heading across all its tabs.
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return ''

  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]

  // Prefix match (e.g. /clients/abc -> Clients)
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path + '/')) return title
  }

  // Fallback: capitalize last segment
  const segments = pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  return last.charAt(0).toUpperCase() + last.slice(1)
}

export function MobileHeader() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const title = getTitleFromPathname(pathname)
  const breadcrumbs = useCurrentBreadcrumbs()

  return (
    <header
      data-testid="mobile-header"
      className="sticky top-0 z-40 flex items-center justify-between glass border-b border-[var(--glass-border)] px-4 py-4 md:hidden"
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Profile entry point — full Profile/Settings page (company info, language, account). */}
        <Link
          href="/settings"
          aria-label={t('Profile')}
          data-active={pathname.startsWith('/settings') || undefined}
          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 data-[active]:text-[hsl(var(--primary))] transition-colors"
        >
          <UserCircle className="h-6 w-6" />
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
                    <span className="font-medium text-foreground truncate max-w-[120px]">{crumb.label}</span>
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
          <h1 className="text-lg font-[var(--font-weight-semibold)] tracking-[var(--tracking-tight)] truncate">{title}</h1>
        ) : null}
      </div>
      <ThemeToggle />
    </header>
  )
}
