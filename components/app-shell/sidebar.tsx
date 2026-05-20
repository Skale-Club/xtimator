'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ContextualTooltip, TOOLTIP_KEYS } from '@/components/tour/contextual-tooltip'

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
  '/price-book': 'price-book',
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
          // Most-specific-match: on /price-book, both /settings and
          // /price-book match. Pick the longest matching href so only
          // the most specific item lights up.
          const matchedHref = NAV_ITEMS
            .filter((i) =>
              i.exact
                ? pathname === i.href
                : pathname === i.href || pathname.startsWith(i.href + '/')
            )
            .map((i) => i.href)
            .sort((a, b) => b.length - a.length)[0]
          const isActive = item.exact ? pathname === item.href : item.href === matchedHref
          const Icon = item.icon

          const baseLayout =
            'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-[var(--font-weight-medium)] transition-all duration-150'

          const linkClassName = item.primary
            ? cn(
                baseLayout,
                'gradient-brand text-white shadow-xs hover:shadow-glow-brand hover:-translate-y-[0.5px] active:translate-y-0'
              )
            : cn(
                baseLayout,
                'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
                'data-[active]:bg-[var(--glass-bg-light)] data-[active]:text-foreground',
                'data-[active]:before:content-[""] data-[active]:before:absolute data-[active]:before:left-0 data-[active]:before:top-2 data-[active]:before:bottom-2 data-[active]:before:w-[1.5px] data-[active]:before:rounded-full data-[active]:before:bg-[image:var(--gradient-brand)]'
              )

          const TOOLTIP_MAP: Record<string, { key: (typeof TOOLTIP_KEYS)[keyof typeof TOOLTIP_KEYS]; text: string }> = {
            '/clients':             { key: TOOLTIP_KEYS.clients,   text: 'Clients are saved automatically when you send an estimate' },
            '/price-book': { key: TOOLTIP_KEYS.priceBook, text: 'Save your most-used items to speed up future estimates' },
          }

          const tooltipConfig = TOOLTIP_MAP[item.href]
          const dataTour = TOUR_TARGET[item.href]

          const linkEl = (
            <Link
              href={item.href}
              data-tour={dataTour ?? undefined}
              data-active={isActive || undefined}
              className={linkClassName}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{t(item.label)}</span>
            </Link>
          )

          return tooltipConfig ? (
            <ContextualTooltip
              key={item.href}
              tooltipKey={tooltipConfig.key}
              text={tooltipConfig.text}
              side="right"
            >
              {linkEl}
            </ContextualTooltip>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              data-tour={dataTour ?? undefined}
              data-active={isActive || undefined}
              className={linkClassName}
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
