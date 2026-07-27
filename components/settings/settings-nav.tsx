'use client'

import { usePathname } from 'next/navigation'
import {
  Bell, BookOpen, Building2, CreditCard, FileText,
  Mail, Plug, ShieldCheck, Users,
} from 'lucide-react'
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav'

const ITEMS: (SubNavItem & { demoHidden?: boolean })[] = [
  { value: 'company',       label: 'Company',       Icon: Building2,   href: '/settings/company'            },
  { value: 'account',       label: 'Account',       Icon: ShieldCheck, href: '/settings/account',            demoHidden: true },
  { value: 'team',          label: 'Team',          Icon: Users,       href: '/settings/team'               },
  { value: 'notifications', label: 'Notifications', Icon: Bell,        href: '/settings/notifications'      },
  { value: 'estimates',     label: 'Estimates',     Icon: FileText,    href: '/settings/estimates',          demoHidden: true },
  { value: 'billing',       label: 'Plans',         Icon: CreditCard,  href: '/settings/billing',            demoHidden: true },
  { value: 'templates',     label: 'Message Template', Icon: Mail,     href: '/settings/estimate-templates', demoHidden: true },
  { value: 'knowledge',     label: 'Knowledge',     Icon: BookOpen,    href: '/settings/knowledge',          demoHidden: true },
  { value: 'integrations',  label: 'Integrations',  Icon: Plug,        href: '/settings/integrations',       demoHidden: true },
]

export function SettingsNav({ collapsed, isDemo }: { collapsed?: boolean; isDemo?: boolean }) {
  const pathname = usePathname()
  const items = ITEMS.filter((item) => !(isDemo && item.demoHidden))

  const activeValue =
    items.find(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.value ?? ''

  // The settings rail is a vertical, collapsible list at ALL breakpoints
  // (`alwaysVertical`) — phone, tablet, and desktop render the same left rail.
  return <SubNav items={items} activeValue={activeValue} collapsed={collapsed} alwaysVertical />
}
