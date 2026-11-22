'use client'

import { usePathname } from 'next/navigation'
import type { ElementType } from 'react'
import {
  Bell, BookOpen, Building2, CreditCard, FileText,
  Mail, MousePointerClick, Palette, Plug, UserRound, Users,
} from 'lucide-react'
import { SidePanelColumn, SidePanelMobilePicker, type SidePanelGroup } from '@/components/ui/side-panel'
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
      { value: 'client-actions', label: 'Client actions', Icon: MousePointerClick, href: '/settings/client-actions', demoHidden: true },
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
  const { t } = useTranslation()
  const groups = SETTINGS_NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !(isDemo && i.demoHidden)) }))
    .filter((g) => g.items.length > 0)
  const active =
    groups
      .flatMap((g) => g.items)
      .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.value ?? ''
  const panelGroups: SidePanelGroup[] = groups.map((g) => ({
    key: g.label,
    label: t(g.label),
    items: g.items.map((i) => ({ key: i.value, label: t(i.label), icon: i.Icon, href: i.href })),
  }))
  return { panelGroups, active }
}

/**
 * Desktop column (md+): the shared side panel, sticky and full height under the
 * 4rem top bar. The page keeps scrolling in main (settings pages have a sticky
 * save bar), so the column is the only thing pinned.
 */
export function SettingsNav({ isDemo }: { isDemo?: boolean }) {
  const { t } = useTranslation()
  const { panelGroups, active } = useNav(isDemo)

  return (
    <SidePanelColumn
      id="settings"
      title={t('Settings')}
      groups={panelGroups}
      activeKey={active}
      filterThreshold={Infinity}
      className="sticky top-0 h-[calc(100dvh-4rem)] self-start"
    />
  )
}

/**
 * Phone/tablet: a full-width button pinned under the top bar names the current
 * section and opens the same grouped list as a bottom sheet; picking a section
 * navigates and closes it.
 */
export function SettingsNavStrip({ isDemo }: { isDemo?: boolean }) {
  const { t } = useTranslation()
  const { panelGroups, active } = useNav(isDemo)

  return (
    <div className="px-4 py-2.5">
      <SidePanelMobilePicker
        title={t('Settings')}
        description={t('Choose a settings section')}
        groups={panelGroups}
        activeKey={active}
        filterThreshold={Infinity}
        testId="settings-nav-trigger"
        className="h-10 w-full max-w-none justify-between"
      />
    </div>
  )
}
