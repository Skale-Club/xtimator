'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    // SOLID background per Phase 71 perf gate — no backdrop-blur on bottom-nav.
    // Active items get gradient-brand text via bg-clip-text (cheap, no GPU blur cost).
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-background md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={TOUR_TARGET[item.href] ?? undefined}
            data-active={isActive || undefined}
            className={cn(
              'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-xs transition-colors duration-150',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
              item.primary && 'relative'
            )}
          >
            {item.primary ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-full)] bg-[image:var(--gradient-brand)] text-primary-foreground shadow-md">
                <Icon className="h-5 w-5" />
              </span>
            ) : (
              <Icon
                className={cn(
                  'h-5 w-5',
                  isActive ? 'text-[hsl(var(--primary))]' : ''
                )}
              />
            )}
            <span
              className={cn(
                'text-[10px]',
                item.primary && 'mt-0.5',
                // Active (non-primary) label uses gradient text via bg-clip
                isActive && !item.primary &&
                  'text-transparent bg-clip-text bg-[image:var(--gradient-brand)]'
              )}
            >
              {t(item.label)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
// v2
