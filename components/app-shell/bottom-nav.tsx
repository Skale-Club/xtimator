'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'

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
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTranslation()

  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  function openModal(modalValue: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('modal', modalValue)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Reorder so the primary CTA always sits in the dead center of the visible
  // items — regardless of whether demo-hidden items are shown (5 vs 7 items).
  const visibleItems = NAV_ITEMS.filter((item) => !(isDemo && item.demoHidden))
  const primary = visibleItems.find((item) => item.primary)
  const rest = visibleItems.filter((item) => !item.primary)
  const orderedItems = primary
    ? [...rest.slice(0, Math.floor(rest.length / 2)), primary, ...rest.slice(Math.floor(rest.length / 2))]
    : visibleItems

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-start justify-around border-t border-border bg-background md:hidden pb-[env(safe-area-inset-bottom,_0px)]"
    >
      {orderedItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon
        const dataTour = TOUR_TARGET[item.href] ?? undefined
        const itemClass = cn(
          'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center px-3 py-2 transition-colors duration-150',
          isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          item.primary && 'relative'
        )
        const iconEl = item.primary ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-full)] bg-[image:var(--gradient-brand)] text-primary-foreground shadow-md">
            <Icon className="h-5 w-5" />
          </span>
        ) : (
          <Icon className={cn('h-5 w-5', isActive ? 'text-[hsl(var(--primary))]' : '')} />
        )
        const labelEl = item.primary ? (
          <span className="text-[10px] font-medium leading-none mt-1">{t(item.label)}</span>
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
          </Link>
        )
      })}
    </nav>
  )
}
