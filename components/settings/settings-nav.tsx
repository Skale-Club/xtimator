'use client'

import { usePathname } from 'next/navigation'
import {
  Bell, BookOpen, Building2, CreditCard, FileText, Globe,
  PenLine, Plug, ShieldCheck, Send, Wallet, Users,
} from 'lucide-react'
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav'

const ITEMS: SubNavItem[] = [
  { value: 'company',            label: 'Company',       Icon: Building2,   href: '/settings/company'            },
  { value: 'account',            label: 'Account',       Icon: ShieldCheck, href: '/settings/account'            },
  { value: 'team',               label: 'Team',          Icon: Users,       href: '/settings/team'               },
  { value: 'notifications',      label: 'Notifications', Icon: Bell,        href: '/settings/notifications'      },
  { value: 'defaults',           label: 'Defaults',      Icon: FileText,    href: '/settings/defaults'           },
  { value: 'delivery',           label: 'Delivery',      Icon: Send,        href: '/settings/delivery'           },
  { value: 'billing',            label: 'Billing',       Icon: CreditCard,  href: '/settings/billing'            },
  { value: 'payments',           label: 'Payments',      Icon: Wallet,      href: '/settings/payments'           },
  { value: 'templates',          label: 'Templates',     Icon: PenLine,     href: '/settings/estimate-templates' },
  { value: 'domain',             label: 'Domain',        Icon: Globe,       href: '/settings/custom-domain'      },
  { value: 'knowledge',          label: 'Knowledge',     Icon: BookOpen,    href: '/settings/knowledge'          },
  { value: 'integrations',       label: 'Integrations',  Icon: Plug,        href: '/settings/integrations'       },
]

export function SettingsNav({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname()

  const activeValue =
    ITEMS.find(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.value ?? ''

  return <SubNav items={ITEMS} activeValue={activeValue} collapsed={collapsed} alwaysVertical />
}
