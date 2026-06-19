'use client'

import { usePathname } from 'next/navigation'
import {
  Bell, Building2, CreditCard, FileText, Globe,
  PenLine, Plug, ShieldCheck, Send, Wallet, User, Users,
} from 'lucide-react'
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav'

const ITEMS: SubNavItem[] = [
  { value: 'general',            label: 'General',       Icon: User,        href: '/settings/general'            },
  { value: 'company',            label: 'Company',       Icon: Building2,   href: '/settings/company'            },
  { value: 'defaults',           label: 'Defaults',      Icon: FileText,    href: '/settings/defaults'           },
  { value: 'notifications',      label: 'Notifs',        Icon: Bell,        href: '/settings/notifications'      },
  { value: 'delivery',           label: 'Delivery',      Icon: Send,        href: '/settings/delivery'           },
  { value: 'billing',            label: 'Billing',       Icon: CreditCard,  href: '/settings/billing'            },
  { value: 'payments',           label: 'Payments',      Icon: Wallet,      href: '/settings/payments'           },
  { value: 'templates',          label: 'Templates',     Icon: PenLine,     href: '/settings/estimate-templates' },
  { value: 'domain',             label: 'Domain',        Icon: Globe,       href: '/settings/custom-domain'      },
  { value: 'integrations',       label: 'Integrations',  Icon: Plug,        href: '/settings/integrations'       },
  { value: 'staff',              label: 'Staff',         Icon: Users,       href: '/settings/staff'              },
  { value: 'account',            label: 'Account',       Icon: ShieldCheck, href: '/settings/account'            },
]

export function SettingsNav() {
  const pathname = usePathname()

  const activeValue =
    ITEMS.find(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.value ?? ''

  return <SubNav items={ITEMS} activeValue={activeValue} />
}
