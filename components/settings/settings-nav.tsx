'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell, Building2, CreditCard, FileText, Globe,
  PenLine, Plug, ShieldCheck, Send, Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { slug: 'company',            label: 'Company',       Icon: Building2  },
  { slug: 'defaults',           label: 'Defaults',      Icon: FileText   },
  { slug: 'notifications',      label: 'Notifications', Icon: Bell       },
  { slug: 'delivery',           label: 'Delivery',      Icon: Send       },
  { slug: 'billing',            label: 'Billing',       Icon: CreditCard },
  { slug: 'payments',           label: 'Payments',      Icon: Wallet     },
  { slug: 'estimate-templates', label: 'Templates',     Icon: PenLine    },
  { slug: 'custom-domain',      label: 'Domain',        Icon: Globe      },
  { slug: 'integrations',       label: 'Integrations',  Icon: Plug       },
  { slug: 'account',            label: 'Account',       Icon: ShieldCheck },
] as const

// v2-vertical
export function SettingsNav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
      {ITEMS.map(({ slug, label, Icon }) => {
        const href = `/settings/${slug}`
        const isActive = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={slug}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-[var(--glass-bg-light)] text-foreground'
                : 'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
