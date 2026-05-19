'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'

interface SidebarProps {
  branding: {
    appName: string
    logoUrl: string | null
  }
  company: {
    id: string
    name: string
    logo_url: string | null
    owner_name: string | null
  }
}

// Map from href to data-tour value — used by the guided spotlight tour (Phase 74)
const TOUR_TARGET: Record<string, string> = {
  '/projects/new':        'new-project',
  '/projects':            'projects',
  '/clients':             'clients',
  '/settings/price-book': 'price-book',
}

export function Sidebar({ branding, company: _company }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const logoUrl = branding.logoUrl

  return (
    <aside
      data-testid="app-sidebar"
      className="hidden md:flex flex-col w-16 lg:w-64 transition-all glass border-r border-[var(--glass-border)]"
    >
      {/* Product branding */}
      <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-3 h-16">
        <div className="h-9 w-9 shrink-0 flex items-center justify-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={branding.appName}
              className="h-9 w-9 object-contain"
            />
          ) : (
            <span className="h-9 w-9 flex items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-foreground text-sm font-semibold">
              {branding.appName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <span className="hidden lg:block truncate text-sm font-semibold">
          {branding.appName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon

          const baseLayout =
            'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-[var(--font-weight-medium)] transition-all duration-150'

          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={TOUR_TARGET[item.href] ?? undefined}
              data-active={isActive || undefined}
              className={
                item.primary
                  ? cn(
                      baseLayout,
                      'gradient-brand text-white shadow-xs hover:shadow-glow-brand hover:-translate-y-[0.5px] active:translate-y-0'
                    )
                  : cn(
                      baseLayout,
                      'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
                      'data-[active]:bg-[var(--glass-bg-light)] data-[active]:text-foreground',
                      // 1.5px gradient-brand left bar on active item (UI-SPEC pattern 4)
                      'data-[active]:before:content-[""] data-[active]:before:absolute data-[active]:before:left-0 data-[active]:before:top-2 data-[active]:before:bottom-2 data-[active]:before:w-[1.5px] data-[active]:before:rounded-full data-[active]:before:bg-[image:var(--gradient-brand)]'
                    )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{t(item.label)}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
