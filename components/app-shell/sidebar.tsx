'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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

const COLLAPSE_KEY = 'sidebar_collapsed_desktop'
const DESKTOP_SIDEBAR_QUERY = '(min-width: 768px)'

function useIsOffline(): boolean {
  const [offline, setOffline] = useState(() =>
    typeof navigator === 'undefined' ? false : !navigator.onLine,
  )

  useEffect(() => {
    const onOnline  = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  return offline
}

// Map from href to data-tour value — used by the guided spotlight tour (Phase 74)
const TOUR_TARGET: Record<string, string> = {
  '/projects/new': 'new-project',
  '/projects':     'projects',
  '/clients':      'clients',
  '/price-book':   'price-book',
}

export function Sidebar({ branding }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTranslation()

  function openModal(modalValue: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('modal', modalValue)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const logoUrl = branding.logoUrl

  const [collapsed, setCollapsed] = useState(false)
  const offline = useIsOffline()

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_SIDEBAR_QUERY)

    function applyDefault() {
      const saved = localStorage.getItem(COLLAPSE_KEY)
      if (saved === '1' || saved === '0') {
        setCollapsed(saved === '1')
        return
      }

      setCollapsed(!mediaQuery.matches)
    }

    applyDefault()

    mediaQuery.addEventListener('change', applyDefault)
    return () => mediaQuery.removeEventListener('change', applyDefault)
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
        'hidden md:flex flex-col shrink-0 overflow-hidden transition-[width] duration-200 glass border-r border-[var(--glass-border)]',
        collapsed ? 'w-16' : 'w-64',
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
      <nav className={cn('flex-1 flex flex-col gap-1', collapsed ? 'px-0 py-2 items-center' : 'p-2')}>
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
                collapsed && 'w-9 h-9 mx-auto justify-center px-0 py-0 gap-0',
              )
            : cn(
                baseLayout,
                'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
                'data-[active]:bg-[var(--glass-bg-light)] data-[active]:text-foreground',
                'data-[active]:before:content-[""] data-[active]:before:absolute data-[active]:before:left-0 data-[active]:before:top-2 data-[active]:before:bottom-2 data-[active]:before:w-[1.5px] data-[active]:before:rounded-full data-[active]:before:bg-[image:var(--gradient-brand)]',
                collapsed && 'w-9 h-9 mx-auto justify-center px-0 py-0 gap-0',
              )

          const TOOLTIP_MAP: Record<string, { key: (typeof TOOLTIP_KEYS)[keyof typeof TOOLTIP_KEYS]; text: string }> = {
            '/clients':    { key: TOOLTIP_KEYS.clients,   text: 'Clients are saved automatically when you send an estimate' },
            '/price-book': { key: TOOLTIP_KEYS.priceBook, text: 'Save your most-used items to speed up future estimates' },
          }

          const tooltipConfig = TOOLTIP_MAP[item.href]
          const dataTour = TOUR_TARGET[item.href]

          const linkEl = item.modal ? (
            <button
              key={item.href}
              type="button"
              data-tour={dataTour ?? undefined}
              className={linkClassName}
              onClick={() => openModal(item.modal!)}
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
            </button>
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
                  'truncate transition-opacity duration-150 whitespace-nowrap',
                  collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100',
                )}
              >
                {t(item.label)}
              </span>
            </Link>
          )

          // When primary (New Project) and offline, render disabled button with tooltip
          if (item.primary && offline) {
            const offlineEl = (
              <button
                disabled
                aria-disabled="true"
                className={cn(
                  linkClassName,
                  'opacity-50 cursor-not-allowed pointer-events-none',
                )}
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
              </button>
            )
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{offlineEl}</TooltipTrigger>
                <TooltipContent side="right">Requires internet connection</TooltipContent>
              </Tooltip>
            )
          }

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
            linkEl
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className={cn('border-t border-[var(--glass-border)]', collapsed ? 'py-2 px-0 flex justify-center' : 'p-2')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggle}
              className={cn(
                'flex items-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground transition-colors',
                collapsed
                  ? 'w-9 h-9 justify-center'
                  : 'w-full gap-3 px-3 py-2',
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
// sidebar v3
