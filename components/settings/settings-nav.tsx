'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, type ElementType } from 'react'
import {
  Bell, BookOpen, Building2, CreditCard, FileText,
  Mail, Palette, Plug, UserRound, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'

interface NavItem {
  value: string
  label: string
  Icon: ElementType
  href: string
  /** Not shown in the read-only public demo (the page redirects there). */
  demoHidden?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// Grouped by who the setting is for: the business, the estimates it sends,
// the signed-in person, and outside services. Labels match the page titles.
export const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Business',
    items: [
      { value: 'company', label: 'Company',          Icon: Building2,  href: '/settings/company' },
      { value: 'team',    label: 'Team',             Icon: Users,      href: '/settings/team' },
      { value: 'billing', label: 'Plan and billing', Icon: CreditCard, href: '/settings/billing', demoHidden: true },
    ],
  },
  {
    label: 'Estimates',
    items: [
      { value: 'estimates', label: 'Estimate defaults', Icon: FileText, href: '/settings/estimates',          demoHidden: true },
      { value: 'templates', label: 'Client message',    Icon: Mail,     href: '/settings/estimate-templates', demoHidden: true },
      { value: 'knowledge', label: 'AI knowledge',      Icon: BookOpen, href: '/settings/knowledge',          demoHidden: true },
    ],
  },
  {
    label: 'You',
    items: [
      { value: 'account',       label: 'Account',       Icon: UserRound, href: '/settings/account',       demoHidden: true },
      { value: 'notifications', label: 'Notifications', Icon: Bell,      href: '/settings/notifications' },
      { value: 'appearance',    label: 'Appearance',    Icon: Palette,   href: '/settings/appearance',    demoHidden: true },
    ],
  },
  {
    label: 'Connections',
    items: [
      { value: 'integrations', label: 'Integrations', Icon: Plug, href: '/settings/integrations', demoHidden: true },
    ],
  },
]

function useNav(isDemo?: boolean) {
  const pathname = usePathname()
  const groups = SETTINGS_NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !(isDemo && i.demoHidden)) }))
    .filter((g) => g.items.length > 0)
  const active =
    groups
      .flatMap((g) => g.items)
      .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.value ?? ''
  return { groups, active }
}

/** Desktop rail: grouped vertical list. */
export function SettingsNav({ isDemo }: { isDemo?: boolean }) {
  const { t } = useTranslation()
  const { groups, active } = useNav(isDemo)

  return (
    <nav aria-label={t('Settings')} className="space-y-6">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {t(group.label)}
          </p>
          {group.items.map(({ value, label, Icon, href }) => {
            const isActive = active === value
            return (
              <Link
                key={value}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--glass-bg-light)] text-foreground'
                    : 'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} aria-hidden />
                <span className="truncate">{t(label)}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/**
 * Phone/tablet: one row of pills that scrolls sideways, pinned under the top
 * bar. Takes no width from the page (the desktop rail would eat half a phone).
 */
export function SettingsNavStrip({ isDemo }: { isDemo?: boolean }) {
  const { t } = useTranslation()
  const { groups, active } = useNav(isDemo)
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [active])

  return (
    <nav
      aria-label={t('Settings')}
      className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 py-2.5"
    >
      {groups.flatMap((g) => g.items).map(({ value, label, Icon, href }) => {
        const isActive = active === value
        return (
          <Link
            key={value}
            ref={isActive ? activeRef : undefined}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', isActive && 'text-primary')} aria-hidden />
            {t(label)}
          </Link>
        )
      })}
    </nav>
  )
}
