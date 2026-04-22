'use client'

import { usePathname } from 'next/navigation'

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

  return (
    <header className="flex items-center border-b border-border bg-background px-4 py-4 md:hidden">
      <h1 className="text-lg font-[var(--font-weight-semibold)] tracking-[var(--tracking-tight)]">{title}</h1>
    </header>
  )
}
