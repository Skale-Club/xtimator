'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Category } from '@/lib/admin/integrations-providers'

interface Props {
  categories: ReadonlyArray<Pick<Category, 'slug' | 'title' | 'navLabel'>>
}

/**
 * Link-based nav for the integrations area. Replaces the previous Radix Tabs
 * client component so each category becomes a real URL (bookmark + back button
 * + share-link friendly).
 *
 * Active state derived from `usePathname()` matching `/admin/integrations/{slug}`.
 */
export function IntegrationsNav({ categories }: Props) {
  const pathname = usePathname()
  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex items-center gap-0 overflow-x-auto" aria-label="Integration categories">
        {categories.map((c) => {
          const href = `/admin/integrations/${c.slug}`
          const isActive = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={c.slug}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors',
                'border-b-2',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {c.navLabel ?? c.title}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
