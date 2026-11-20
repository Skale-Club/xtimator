'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ElementType } from 'react'
import {
  Bell, BookOpen, Building2, ChevronDown, CreditCard, FileText,
  Mail, Menu, Palette, Plug, UserRound, Users,
} from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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

/** Grouped vertical list: the desktop rail, and the phone drawer's content. */
export function SettingsNav({ isDemo, onNavigate }: { isDemo?: boolean; onNavigate?: () => void }) {
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
                onClick={onNavigate}
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
 * Phone/tablet (redesign 2026-11-20): no sideways-scrolling pills. A button
 * pinned under the top bar names the current section and opens the same
 * grouped sidebar as desktop from the left; picking a section closes it.
 */
export function SettingsNavStrip({ isDemo }: { isDemo?: boolean }) {
  const { t } = useTranslation()
  const { groups, active } = useNav(isDemo)
  const [open, setOpen] = useState(false)
  const current = groups.flatMap((g) => g.items).find((i) => i.value === active)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="px-4 py-2.5">
        <SheetTrigger asChild>
          <button
            type="button"
            data-testid="settings-nav-trigger"
            className="flex h-10 w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-[var(--glass-bg-light)] px-3 text-sm font-medium text-foreground transition-colors hover:bg-[var(--glass-bg)]"
          >
            <Menu className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {current ? (
              <>
                <current.Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{t(current.label)}</span>
              </>
            ) : (
              <span className="truncate">{t('Settings')}</span>
            )}
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </SheetTrigger>
      </div>
      <SheetContent side="left" className="w-[290px] gap-0 p-0 sm:max-w-[290px]">
        <SheetHeader className="h-14 flex-row items-center border-b border-[var(--glass-border)] px-4 py-0">
          <SheetTitle className="text-base">{t('Settings')}</SheetTitle>
          <SheetDescription className="sr-only">{t('Choose a settings section')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <SettingsNav isDemo={isDemo} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
