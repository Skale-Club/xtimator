'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { LanguageToggle } from '@/components/app-shell/language-toggle'
import { useTranslation } from '@/lib/i18n/use-translation'

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <nav data-testid="bottom-nav" className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-background md:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-xs transition-colors duration-150',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
              item.primary && 'relative'
            )}
          >
            {item.primary ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-full)] bg-primary text-primary-foreground shadow-md">
                <Icon className="h-5 w-5" />
              </span>
            ) : (
              <Icon className="h-5 w-5" />
            )}
            <span className={cn('text-[10px]', item.primary && 'mt-0.5')}>
              {t(item.label)}
            </span>
          </Link>
        )
      })}
      <div className="flex min-h-[44px] min-w-[44px] items-center justify-center">
        <LanguageToggle />
      </div>
    </nav>
  )
}
