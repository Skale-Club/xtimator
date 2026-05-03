'use client'

import { HoverPrefetchLink } from './hover-prefetch-link'
import { usePathname } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'

interface SidebarProps {
  branding: {
    appName: string
    faviconUrl: string | null
  }
  company: {
    id: string
    name: string
    logo_url: string | null
    owner_name: string | null
  }
}

export function Sidebar({ branding, company: _company }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const faviconUrl = branding.faviconUrl ?? '/favicon.ico'

  return (
    <aside className="hidden md:flex flex-col border-r border-border bg-background w-16 lg:w-64 transition-all">
      {/* Product branding */}
      <div className="flex items-center gap-3 border-b border-border px-3 h-16">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={faviconUrl} alt={branding.appName} />
          <AvatarFallback className="text-sm font-semibold">
            {branding.appName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
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

          return (
            <HoverPrefetchLink
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-[var(--font-weight-medium)] transition-colors duration-150',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                item.primary && !isActive && 'text-primary',
                item.primary && 'border border-primary/20 bg-primary/5 hover:bg-primary/10'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{t(item.label)}</span>
            </HoverPrefetchLink>
          )
        })}
      </nav>
    </aside>
  )
}
