'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Building2, FileText, Palette, ShieldCheck } from 'lucide-react'

const TABS = [
  { slug: 'company', label: 'Company', Icon: Building2 },
  { slug: 'defaults', label: 'Defaults', Icon: FileText },
  { slug: 'notifications', label: 'Notifications', Icon: Bell },
  { slug: 'appearance', label: 'Appearance', Icon: Palette },
  { slug: 'account', label: 'Account', Icon: ShieldCheck },
] as const

export function SettingsNav() {
  const pathname = usePathname()
  return (
    <div className="border-b border-border">
      <nav
        className="-mb-px flex items-center gap-0 overflow-x-auto"
        aria-label="Settings sections"
      >
        {TABS.map(({ slug, label, Icon }) => {
          const href = `/settings/${slug}`
          const isActive = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={slug}
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
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
