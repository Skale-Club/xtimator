'use client'

import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { useCurrentBreadcrumbs } from '@/components/app-shell/breadcrumb-context'
import Link from 'next/link'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clients': 'Clients',
  '/projects/new': 'New Project',
  '/settings': 'Settings',
}

function getTitleFromPathname(pathname: string): string {
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
  const title = getTitleFromPathname(pathname)
  const breadcrumbs = useCurrentBreadcrumbs()

  return (
    <header
      data-testid="mobile-header"
      className="sticky top-0 z-40 flex items-center justify-between glass border-b border-[var(--glass-border)] px-4 py-4 md:hidden"
    >
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
                <span className="font-medium text-foreground truncate max-w-[120px]">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : (
        <h1 className="text-lg font-[var(--font-weight-semibold)] tracking-[var(--tracking-tight)]">{title}</h1>
      )}
      <ThemeToggle />
    </header>
  )
}
