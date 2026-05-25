'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, Settings, LogOut, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ContextualTooltip, TOOLTIP_KEYS } from '@/components/tour/contextual-tooltip'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/lib/actions/auth'
import { useTourContext } from '@/components/tour/tour-provider'
import { useTour } from '@/components/tour/use-tour'

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
  return useSyncExternalStore(
    (onStoreChange) => {
      const onOnline = () => onStoreChange()
      const onOffline = () => onStoreChange()

      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)

      return () => {
        window.removeEventListener('online', onOnline)
        window.removeEventListener('offline', onOffline)
      }
    },
    () => !navigator.onLine,
    () => false,
  )
}

// Map from href to data-tour value — used by the guided spotlight tour (Phase 74)
const TOUR_TARGET: Record<string, string> = {
  '/projects/new': 'new-project',
  '/projects':     'projects',
  '/clients':      'clients',
  '/price-book':   'price-book',
}

export function Sidebar({ branding, company }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTranslation()
  const { setShowWelcome, setIsReviewMode } = useTourContext()
  const { resetAllTourState, startTour } = useTour()

  function handleOpenTour() {
    resetAllTourState()
    startTour()
    setIsReviewMode(true)
    setShowWelcome(true)
  }

  const initial = (company.owner_name ?? company.name).charAt(0).toUpperCase()

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
        collapsed ? 'w-16' : 'w-[213px]',
      )}
    >
      {/* Product branding — links to landing page */}
      <Link
        href="/"
        className={cn(
          'flex items-center border-b border-[var(--glass-border)] h-16 overflow-hidden transition-opacity hover:opacity-80',
          collapsed ? 'justify-center gap-0 px-0' : 'gap-2.5 px-4',
        )}
      >
        <div className="h-6 w-6 shrink-0 flex items-center justify-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={branding.appName} className="h-6 w-6 object-contain" />
          ) : (
            <span className="h-6 w-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-foreground text-xs font-semibold">
              {branding.appName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <span
          className={cn(
            'truncate text-lg font-bold tracking-tight transition-opacity duration-150',
            collapsed ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100',
          )}
        >
          {branding.appName}
        </span>
      </Link>

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

      {/* Bottom: company info + user menu + collapse toggle */}
      <div className="border-t border-[var(--glass-border)] p-2">
        {collapsed ? (
          /* Collapsed: chevron on top, avatar (user menu) below */
          <div className="flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  className="w-9 h-7 flex items-center justify-center rounded-[var(--radius-md)] text-muted-foreground/40 hover:text-muted-foreground hover:bg-[var(--glass-bg-light)] transition-colors"
                  aria-label="Expand sidebar"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('Expand sidebar')}</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--glass-bg-light)] transition-colors">
                      <span className="h-7 w-7 flex items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {initial}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">{company.owner_name ?? company.name}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent side="right" align="end" className="w-48">
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />{t('Settings')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleOpenTour}>
                  <HelpCircle className="h-4 w-4" />{t('App Tour')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  onClick={() => signOut()}
                >
                  <LogOut className="h-4 w-4" />{t('Sign Out')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          /* Expanded: company info row opens menu, chevron on hover */
          <DropdownMenu>
            <div className="flex items-center gap-1 group">
              <DropdownMenuTrigger asChild>
                <button className="flex flex-1 min-w-0 items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--glass-bg-light)] transition-colors text-left">
                  {company.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={company.logo_url} alt={company.name} className="h-6 w-6 rounded object-contain shrink-0" />
                  ) : (
                    <span className="h-6 w-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-muted text-[11px] font-semibold text-muted-foreground shrink-0">
                      {company.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{company.name}</p>
                    {company.owner_name && (
                      <p className="text-[11px] text-muted-foreground truncate">{company.owner_name}</p>
                    )}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <button
                onClick={toggle}
                className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <DropdownMenuContent side="right" align="end" className="w-48">
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />{t('Settings')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleOpenTour}>
                <HelpCircle className="h-4 w-4" />{t('App Tour')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                onClick={() => signOut()}
              >
                <LogOut className="h-4 w-4" />{t('Sign Out')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  )
}
// sidebar v3
