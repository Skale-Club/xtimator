'use client'

import { usePathname } from 'next/navigation'
import {
  Bell, BookOpen, Building2, CreditCard, FileText,
  Mail, Plug, ShieldCheck, Users,
} from 'lucide-react'
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav'
import { useSubNavScroll } from './use-subnav-scroll'

const ITEMS: SubNavItem[] = [
  { value: 'company',       label: 'Company',       Icon: Building2,   href: '/settings/company'            },
  { value: 'account',       label: 'Account',       Icon: ShieldCheck, href: '/settings/account'            },
  { value: 'team',          label: 'Team',          Icon: Users,       href: '/settings/team'               },
  { value: 'notifications', label: 'Notifications', Icon: Bell,        href: '/settings/notifications'      },
  { value: 'estimates',     label: 'Estimates',     Icon: FileText,    href: '/settings/estimates'          },
  { value: 'billing',       label: 'Plans',         Icon: CreditCard,  href: '/settings/billing'           },
  { value: 'templates',     label: 'Message Template', Icon: Mail,     href: '/settings/estimate-templates' },
  { value: 'knowledge',     label: 'Knowledge',     Icon: BookOpen,    href: '/settings/knowledge'          },
  { value: 'integrations',  label: 'Integrations',  Icon: Plug,        href: '/settings/integrations'       },
]

export function SettingsNav({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname()

  const activeValue =
    ITEMS.find(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.value ?? ''

  // Drag / wheel / auto-scroll for the mobile horizontal pill row. Self-gates
  // on horizontal overflow, so it is inert on the desktop vertical rail.
  const navRef = useSubNavScroll(activeValue)

  // quick-260724 (SEED-051): dropped `alwaysVertical` so SubNav uses its
  // responsive mode — a horizontal scrollable pill row on phone (full-width,
  // immersive) and a vertical rail on desktop (md+), matching the settings
  // skeleton's long-standing layout.
  return <SubNav items={ITEMS} activeValue={activeValue} collapsed={collapsed} navRef={navRef} />
}
