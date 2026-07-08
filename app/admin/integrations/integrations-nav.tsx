'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sparkles,
  Mail,
  MessageCircle,
  CreditCard,
  MessageSquare,
  Contact,
  Receipt,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import type { Category } from '@/lib/admin/integrations-providers'
import { useTranslation } from '@/lib/i18n/use-translation'

interface Props {
  categories: ReadonlyArray<Pick<Category, 'slug' | 'title' | 'navLabel'>>
  defaultSlug: string
}

/** Per-category icon so the sub-sidebar reads like the main admin nav. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ai: Sparkles,
  email: Mail,
  whatsapp: MessageCircle,
  stripe: CreditCard,
  sms: MessageSquare,
  crm: Contact,
  billing: Receipt,
}

/**
 * Sub-sidebar nav for the integrations area. Each category is a real URL
 * (`/admin/integrations/{slug}`) so bookmarks, the back button, and share links
 * work. Vertical rail on md+ (mirrors the main AdminNav styling), collapsing to
 * a horizontally-scrollable row on small screens.
 *
 * Active state derived from `usePathname()` matching `/admin/integrations/{slug}`.
 */
export function IntegrationsNav({ categories, defaultSlug }: Props) {
  const pathname = usePathname()
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('Integration categories')}
      className="flex gap-1 overflow-x-auto border-b border-border pb-3 md:w-[184px] md:flex-shrink-0 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:pb-0 md:pr-6"
    >
      {categories.map((c) => {
        const href = `/admin/integrations/${c.slug}`
        const isDefaultRoot =
          c.slug === defaultSlug && pathname === '/admin/integrations'
        const isActive =
          isDefaultRoot || pathname === href || pathname.startsWith(`${href}/`)
        const Icon = CATEGORY_ICONS[c.slug] ?? Settings2
        return (
          <Link
            key={c.slug}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'relative flex h-[38px] items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
              isActive
                ? "bg-[var(--glass-bg-light)] text-foreground md:before:absolute md:before:left-0 md:before:top-2 md:before:bottom-2 md:before:w-[1.5px] md:before:rounded-full md:before:bg-[image:var(--gradient-brand)] md:before:content-['']"
                : 'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
            ].join(' ')}
          >
            <Icon size={16} className="flex-shrink-0" />
            {t(c.navLabel ?? c.title)}
          </Link>
        )
      })}
    </nav>
  )
}
