'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'

interface SidebarProps {
  company: {
    id: string
    name: string
    logo_url: string | null
    owner_name: string | null
  }
}

export function Sidebar({ company }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col border-r bg-muted/40 w-16 lg:w-64 transition-all">
      {/* Company branding */}
      <div className="flex items-center gap-3 border-b px-3 py-4">
        <Avatar className="h-9 w-9 shrink-0">
          {company.logo_url && (
            <AvatarImage src={company.logo_url} alt={company.name} />
          )}
          <AvatarFallback className="text-sm font-semibold">
            {company.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="hidden lg:block truncate text-sm font-semibold">
          {company.name}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive && 'bg-accent text-accent-foreground',
                item.primary && !isActive && 'text-primary',
                item.primary && 'border border-primary/20 bg-primary/5 hover:bg-primary/10'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
