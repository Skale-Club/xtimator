'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ContextualTooltip, TOOLTIP_KEYS } from '@/components/tour/contextual-tooltip'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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

const COLLAPSE_KEY = 'sidebar_collapsed'

// Map from href to data-tour value — used by the guided spotlight tour (Phase 74)
const TOUR_TARGET: Record<string, string> = {
  '/projects/new': 'new-project',
  '/projects':     'projects',
  '/clients':      'clients',
  '/price-book':   'price-book',
}

export function Sidebar({ branding, company: _company }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const logoUrl = branding.logoUrl

  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    setMounted(true)
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <aside
      data-testid="app-sidebar"
      data-collapsed={collapsed || undefined}
      style={{ borderTop: 0, borderBottom: 0, borderLeft: 0 }}
      className={cn(
        'hidden md:flex flex-col transition-[width] duration-200 glass border-r border-[var(--glass-border)]',
        // Before hydration show same width as server (64px) to avoid layout shift
        mounted ? (collapsed ? 'w-16' : 'w-64') : 'w-16 lg:w-64',
      )}
    >
      {/* Product branding */}
      <div
        className={cn(
          'flex items-center border-b border-[var(--glass-border)] h-16 overflow-hidden',
          collapsed ? 'justify-center gap-0 px-0' : 'gap-3 px-3',
        )}
      >
        <div className="h-9 w-9 shrink-0 flex items-center justify-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={branding.appName} className="h-9 w-9 object-contain" />
          ) : (
            <span className="h-9 w-9 flex items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-foreground text-sm font-semibold">
              {branding.appName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <span
          className={cn(
            'truncate text-sm font-semibold transition-opacity duration-150',
            collapsed ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100',
          )}
        >
          {branding.appName}
        </span>
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 flex flex-col gap-1', collapsed ? 'px-0 py-2' : 'p-2')}>
        {NAV_ITEMS.map((item) => {
          const matchedHref = NAV_ITEMS
            .filter((i) =>
              i.exact
                ? pathname === i.href
                : pathname === i.href || pathname.startsWith(i.href + '/'),
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
                'gradient-brand text-white shadow-xs hover:shadow-glow-brand hover:-translate-y-[0.5px] active:translate-y-0',
                collapsed && 'justify-center px-0 gap-0',
              )
            : cn(
                baseLayout,
                'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
                'data-[active]:bg-[var(--glass-bg-light)] data-[active]:text-foreground',
                'data-[active]:before:content-[""] data-[active]:before:absolute data-[active]:before:left-0 data-[active]:before:top-2 data-[active]:before:bottom-2 data-[active]:before:w-[1.5px] data-[active]:before:rounded-full data-[active]:before:bg-[image:var(--gradient-brand)]',
                collapsed && 'justify-center px-0 gap-0',
              )

          const TOOLTIP_MAP: Record<string, { key: (typeof TOOLTIP_KEYS)[keyof typeof TOOLTIP_KEYS]; text: string }> = {
            '/clients':    { key: TOOLTIP_KEYS.clients,   text: 'Clients are saved automatically when you send an estimate' },
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
              <span
                className={cn(
                  'truncate transition-opacity duration-150 whitespace-nowrap',
                  collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100',
                )}
              >
                {t(item.label)}
              </span>
            </Link>
          )

          // When collapsed, wrap in tooltip showing the label
          const withCollapsedTooltip = collapsed ? (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
              <TooltipContent side="right">{t(item.label)}</TooltipContent>
            </Tooltip>
          ) : null

          if (collapsed) return withCollapsedTooltip

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
              <span
                className={cn(
                  'truncate transition-opacity duration-150',
                  collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100',
                )}
              >
                {t(item.label)}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className={cn('border-t border-[var(--glass-border)]', collapsed ? 'py-2 px-0' : 'p-2')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggle}
              className={cn(
                'w-full flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground transition-colors',
                collapsed && 'justify-center px-0 gap-0',
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5 shrink-0" />
              ) : (
                <>
                  <PanelLeftClose className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">{t('Collapse')}</span>
                </>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">{t('Expand sidebar')}</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  )
}
