'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Settings2, Palette, Users, LayoutDashboard, Globe, Layout, FileText, CreditCard, Building2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

const NAV_ITEMS = [
  { href: '/admin',              label: 'Dashboard',    Icon: LayoutDashboard },
  { href: '/admin/seo',          label: 'SEO',          Icon: Globe },
  { href: '/admin/landing',      label: 'Landing Page', Icon: Layout },
  { href: '/admin/blog',         label: 'Blog',         Icon: FileText },
  { href: '/admin/branding',     label: 'Branding',     Icon: Palette },
  {
    href: '/admin/integrations/ai',
    activeBase: '/admin/integrations',
    label: 'Integrations',
    Icon: Settings2,
  },
  { href: '/admin/billing',      label: 'Billing',      Icon: CreditCard },
  { href: '/admin/companies',    label: 'Companies',    Icon: Building2 },
  { href: '/admin/admins',       label: 'Admins',       Icon: Users },
] as const

function LogoFallbackSvg() {
  // Mirrors the inline logomark from components/auth/auth-card.tsx.
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="8" fill="hsl(240 5.9% 10%)" />
      <path
        d="M12 28L20 12L28 28"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 23H25"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface AdminNavProps {
  appName: string
  logoUrl: string | null
  adminEmail?: string
}

export function AdminNav({ appName, logoUrl, adminEmail }: AdminNavProps) {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('Platform admin navigation')}
      className="w-[240px] flex-shrink-0 border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] flex flex-col"
    >
      <div className="px-4 pt-6 pb-6 flex items-center gap-2">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            width={40}
            height={40}
            aria-hidden="true"
          />
        ) : (
          <LogoFallbackSvg />
        )}
        <span className="font-semibold text-sm">{appName} {t('Admin')}</span>
      </div>
      <ul className="flex-1 flex flex-col gap-1 px-2">
        {NAV_ITEMS.map(({ href, label, Icon, ...item }) => {
          const activeBase = 'activeBase' in item ? item.activeBase : href
          const isActive =
            href === '/admin'
              ? pathname === '/admin'
              : pathname === activeBase || pathname.startsWith(activeBase + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'relative flex items-center gap-3 h-[40px] px-4 rounded-md text-sm transition-colors',
                  isActive
                    ? "bg-[var(--glass-bg-light)] text-foreground before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[1.5px] before:rounded-full before:bg-[image:var(--gradient-brand)] before:content-['']"
                    : 'hover:bg-[var(--glass-bg-light)] text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <Icon size={16} /> {t(label)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
