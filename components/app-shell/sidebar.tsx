'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, Settings, LogOut, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { openModalParam } from '@/lib/utils/modal-url'
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
import { CompanySelector } from '@/components/app-shell/company-selector'

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
  memberships: Array<{
    id: string
    name: string
    logo_url: string | null
  }>
  /** Read-only public demo session — hides sensitive nav entries. */
  isDemo?: boolean
  /** Platform admin — shows the "Add new company" button in CompanySelector. */
  isAdmin?: boolean
  user?: { email: string; name?: string | null }
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

export function Sidebar({ branding, company, memberships, isDemo, isAdmin, user }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { setShowWelcome, setIsReviewMode } = useTourContext()
  const { resetAllTourState, startTour } = useTour()

  function handleOpenTour() {
    resetAllTourState()
    startTour()
    setIsReviewMode(true)
    setShowWelcome(true)
  }

  // Account menu items injected into the CompanySelector dropdown (2026-05-26 UX —
  // replaces the standalone "S" user-menu avatar that used to sit beside the
  // CompanySelector). Settings / App Tour / Sign Out now live below the
  // company list + Add new company entry inside a single dropdown.
  const accountMenuSlot = (
    <>
      {user && (
        <>
          <div className="px-2 py-2">
            {user.name && (
              <p className="text-sm font-medium truncate">{user.name}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
        </>
      )}
      {!isDemo && (
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />{t('Settings')}
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleOpenTour}>
        <HelpCircle className="h-4 w-4" />{t('App Tour')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
        onClick={() => signOut()}
      >
        <LogOut className="h-4 w-4" />{t('Sign Out')}
      </DropdownMenuItem>
    </>
  )

  function openModal(modalValue: string) {
    // History API → flips the dialog instantly with no RSC page re-render.
    openModalParam(modalValue)
  }
  const logoUrl = branding.logoUrl

  const [collapsed, setCollapsed] = useState(false)
  const offline = useIsOffline()

  // Publish the primary sidebar width so secondary sidebars can pin themselves
  // to its right edge using left-[var(--app-sidebar-width)].
  useEffect(() => {
    document.documentElement.style.setProperty('--app-sidebar-width', collapsed ? '64px' : '213px')
  }, [collapsed])

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
      style={{
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
      }}
      className={cn(
        'hidden md:flex flex-col shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out glass border-r border-[var(--glass-border)]',
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
            'truncate text-lg font-bold tracking-tight transition-all duration-200 ease-in-out overflow-hidden whitespace-nowrap',
            collapsed ? 'opacity-0 max-w-0 pointer-events-none' : 'opacity-100 max-w-[160px]',
          )}
        >
          {branding.appName}
        </span>
      </Link>

      {/* Navigation */}
      <nav className={cn('flex-1 flex flex-col gap-1', collapsed ? 'px-0 py-2 items-center' : 'p-2')}>
        {NAV_ITEMS.filter((item) => !(isDemo && item.demoHidden)).map((item) => {
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
            'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-[var(--font-weight-medium)] transition-all duration-200 ease-in-out'

          const linkClassName = item.primary
            ? cn(
                baseLayout,
                'gradient-brand text-white shadow-xs hover:shadow-glow-brand hover:-translate-y-[0.5px] active:translate-y-0',
                collapsed && 'w-9 h-9 mx-auto justify-center px-0 py-0 gap-0',
              )
            : cn(
                baseLayout,
                'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
                'data-[active]:bg-primary/10 data-[active]:text-primary',
                'data-[active]:before:content-[""] data-[active]:before:absolute data-[active]:before:left-0 data-[active]:before:top-1.5 data-[active]:before:bottom-1.5 data-[active]:before:w-[3px] data-[active]:before:rounded-full data-[active]:before:bg-[image:var(--gradient-brand)]',
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
                  'truncate transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden',
                  collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[160px]',
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
                  'truncate transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden',
                  collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[160px]',
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
                    'truncate transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden',
                    collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[160px]',
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

      {/* Bottom: company switcher (Plan 81-04) + user menu + collapse toggle.
          Fixed h keeps this in lockstep with the settings sub-sidebar footer
          (--app-rail-footer-h). Collapsed uses px-1 + flex-row so both items
          fit within the w-16 sidebar without stacking (which would overflow). */}
      <div className={cn(
        'flex flex-col justify-center h-[var(--app-rail-footer-h)] shrink-0 border-t border-[var(--glass-border)]',
        collapsed ? 'px-1' : 'p-2',
      )}>
        {collapsed ? (
          /* Collapsed: company-switcher avatar + expand chevron in a single row.
             Row layout keeps height = max(h-9, h-7) = 36px, fitting within the
             53px footer. User-menu items live inside the CompanySelector dropdown
             via accountMenuSlot (2026-05-26 UX). */
          <div className="flex items-center">
            <CompanySelector
              companies={memberships}
              activeCompanyId={company.id}
              collapsed={true}
              isAdmin={isAdmin}
              accountMenuSlot={accountMenuSlot}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  className="ml-auto h-7 w-5 flex items-center justify-center rounded-[var(--radius-md)] text-muted-foreground/40 hover:text-muted-foreground hover:bg-[var(--glass-bg-light)] transition-colors"
                  aria-label="Expand sidebar"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('Expand sidebar')}</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Expanded: CompanySelector row (includes user-menu via accountMenuSlot)
             + collapse chevron pinned right (2026-05-26 UX — old "S" user-menu
             avatar removed; Settings / App Tour / Sign Out now live inside the
             CompanySelector dropdown). */
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0">
              <CompanySelector
                companies={memberships}
                activeCompanyId={company.id}
                collapsed={false}
                isAdmin={isAdmin}
                accountMenuSlot={accountMenuSlot}
              />
            </div>
            <button
              onClick={toggle}
              className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
// sidebar v3
