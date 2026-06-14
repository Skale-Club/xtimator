'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FolderOpen, Users, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/demo/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/demo/projects', label: 'Projects', icon: FolderOpen },
  { href: '/demo/clients', label: 'Clients', icon: Users },
  { href: '/demo/price-book', label: 'Price Book', icon: BookOpen },
]

/**
 * Navigation for the public, read-only demo. Links stay within the /demo/* tree
 * so the demo is fully self-contained and never touches the authenticated app.
 */
export function DemoNav() {
  const pathname = usePathname()
  return (
    <nav className="sticky top-0 z-40 flex items-center gap-1 overflow-x-auto border-b border-border bg-background/85 px-4 py-2 backdrop-blur scrollbar-none">
      {ITEMS.map((item) => {
        const active = pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
