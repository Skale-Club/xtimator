'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppIcon } from '@/components/ui/app-icon'
import { Settings2, Palette, Users, LayoutDashboard, Globe, Layout, FileText, CreditCard, Building2, Scale, ScrollText, Inbox, BookOpen, Bell } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

const TOP_ITEMS = [
  { href: '/admin',           label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/admin/companies', label: 'Companies', Icon: Building2 },
  { href: '/admin/inbox',     label: 'Inbox',     Icon: Inbox },
] as const

const CONTENT_GROUP_ITEMS = [
  { href: '/admin/landing', label: 'Landing Page', Icon: Layout },
  { href: '/admin/pages',   label: 'Pages',         Icon: Scale },
  { href: '/admin/blog',    label: 'Blog',          Icon: FileText },
  { href: '/admin/seo',     label: 'SEO',           Icon: Globe },
  { href: '/admin/branding', label: 'Branding',     Icon: Palette },
] as const

const BOTTOM_ITEMS = [
  { href: '/admin/knowledge', label: 'Knowledge', Icon: BookOpen },
  { href: '/admin/notifications', label: 'Notifications', Icon: Bell },
  {
    href: '/admin/integrations/ai',
    activeBase: '/admin/integrations',
    label: 'Integrations',
    Icon: Settings2,
  },
  { href: '/admin/billing', label: 'Billing',   Icon: CreditCard },
  { href: '/admin/admins',  label: 'Admins',    Icon: Users },
  { href: '/admin/events',  label: 'Event Log', Icon: ScrollText },
] as const

interface AdminNavProps {
  appName: string
  logoUrl: string | null
  adminEmail?: string
}

interface NavItem {
  href: string
  label: string
  Icon: typeof LayoutDashboard
  activeBase?: string
}

function NavLink({ href, label, Icon, activeBase, pathname, t }: NavItem & {
  pathname: string
  t: (s: string) => string
}) {
  const base = activeBase ?? href
  const isActive =
    href === '/admin'
      ? pathname === '/admin'
      : pathname === base || pathname.startsWith(base + '/')
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
}

export function AdminNav({ appName, logoUrl, adminEmail }: AdminNavProps) {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('Platform admin navigation')}
      className="w-[240px] flex-shrink-0 border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] flex flex-col h-full overflow-y-auto"
    >
      <div className="px-4 pt-6 pb-6 flex items-center gap-2">
        <AppIcon logoUrl={logoUrl} appName={appName} className="h-10 w-10" />
        <span className="font-semibold text-sm">{appName} {t('Admin')}</span>
      </div>
      <ul className="flex-1 flex flex-col gap-1 px-2 pb-4">
        {TOP_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} t={t} />
        ))}

        <li aria-hidden="true">
          <div className="px-4 pt-4 pb-1 text-xs uppercase tracking-wide text-muted-foreground">
            {t('Content')}
          </div>
        </li>
        {CONTENT_GROUP_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} t={t} />
        ))}

        {BOTTOM_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} t={t} />
        ))}
      </ul>
    </nav>
  )
}
