'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { openModalParam } from '@/lib/utils/modal-url'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Map from href to data-tour value — mirrors sidebar targets for mobile (Phase 74)
const TOUR_TARGET: Record<string, string> = {
  '/projects/new':        'new-project',
  '/projects':            'projects',
  '/clients':             'clients',
  '/price-book': 'price-book',
}

export function BottomNav({ isDemo }: { isDemo?: boolean }) {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const { t } = useTranslation()

  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  function openModal(modalValue: string) {
    // History API → flips the dialog instantly with no RSC page re-render.
    openModalParam(modalValue)
  }

  // Split visible items into the ones shown directly on the bar and the ones
  // tucked inside the "More" overflow menu (Projects / Price Book / Settings).
  const visibleItems = NAV_ITEMS.filter((item) => !(isDemo && item.demoHidden))
  const barItems = visibleItems.filter((item) => !item.overflow)
  const overflowItems = visibleItems.filter((item) => item.overflow)

  // Reorder so the primary CTA sits in the dead center of the bar, leaving the
  // rightmost slot for the "More" button (ceil splits the extra to the left).
  const primary = barItems.find((item) => item.primary)
  const rest = barItems.filter((item) => !item.primary)
  const leftCount = Math.ceil(rest.length / 2)
  const orderedItems = primary
    ? [...rest.slice(0, leftCount), primary, ...rest.slice(leftCount)]
    : barItems

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-border bg-background md:hidden pb-[env(safe-area-inset-bottom,_0px)]"
    >
      {orderedItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon
        const dataTour = TOUR_TARGET[item.href] ?? undefined
        const itemClass = cn(
          'flex flex-1 basis-0 min-h-[44px] min-w-[44px] flex-col items-center justify-center px-3 py-2 transition-colors duration-150',
          isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          item.primary && 'relative'
        )
        const iconEl = item.primary ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-full)] bg-[image:var(--gradient-brand)] text-primary-foreground shadow-md">
            <Icon className="h-5 w-5" />
          </span>
        ) : (
          <Icon className="h-5 w-5" />
        )
        const labelEl = (
          <span className="text-[10px] font-medium leading-none mt-1 max-w-[64px] truncate">
            {t(item.label)}
          </span>
        )
        // Active-page indicator: a rounded blue (system primary) bar below the
        // label. Rendered (transparent) on every non-primary item so the slot
        // height stays identical between active/inactive and items stay aligned.
        const indicatorEl = !item.primary ? (
          <span
            className={cn(
              'mt-1 h-[3px] w-6 rounded-full',
              isActive ? 'bg-[hsl(var(--primary))]' : 'bg-transparent'
            )}
          />
        ) : null
        if (item.modal) {
          return (
            <button
              key={item.href}
              type="button"
              data-tour={dataTour}
              aria-label={t(item.label)}
              className={itemClass}
              onClick={() => openModal(item.modal!)}
            >
              {iconEl}
              {labelEl}
              {indicatorEl}
            </button>
          )
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={dataTour}
            data-active={isActive || undefined}
            aria-label={t(item.label)}
            className={itemClass}
          >
            {iconEl}
            {labelEl}
            {indicatorEl}
          </Link>
        )
      })}

      {overflowItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-tour="more-menu"
              aria-label={t('More')}
              className="flex flex-1 basis-0 min-h-[44px] min-w-[44px] flex-col items-center justify-center px-3 py-2 text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none mt-1">{t('More')}</span>
              {/* Reserve the indicator slot so the icon aligns with the bar items */}
              <span className="mt-1 h-[3px] w-6 rounded-full bg-transparent" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={8} className="mb-1 min-w-[10rem]">
            {overflowItems.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem key={item.href} asChild className="cursor-pointer gap-2">
                  <Link href={item.href}>
                    <Icon className="h-4 w-4" />
                    {t(item.label)}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  )
}
