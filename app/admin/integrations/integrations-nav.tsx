'use client'

import { usePathname } from 'next/navigation'
import {
  Sparkles,
  Mail,
  MessageCircle,
  CreditCard,
  MessageSquare,
  Contact,
  Receipt,
  GraduationCap,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import type { Category } from '@/lib/admin/integrations-providers'
import { SidePanelColumn, SidePanelMobilePicker, type SidePanelGroup } from '@/components/ui/side-panel'
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
  notion: GraduationCap,
}

/**
 * Sub-sidebar nav for the integrations area. Each category is a real URL
 * (`/admin/integrations/{slug}`) so bookmarks, the back button, and share links
 * work. The shared side panel: a collapsible column on md+, a full-width bottom
 * sheet picker on phones.
 *
 * The column is the flex item and stretches to the card's full height (default
 * flex stretch, no sticky), so its `border-r` divider runs the full length.
 *
 * Active state derived from `usePathname()` matching `/admin/integrations/{slug}`.
 */
export function IntegrationsNav({ categories, defaultSlug }: Props) {
  const pathname = usePathname()
  const { t } = useTranslation()

  const items = categories.map((c) => ({
    key: c.slug,
    label: t(c.navLabel ?? c.title),
    icon: CATEGORY_ICONS[c.slug] ?? Settings2,
    href: `/admin/integrations/${c.slug}`,
  }))
  const groups: SidePanelGroup[] = [{ key: 'categories', items }]
  const activeKey =
    categories.find((c) => {
      const href = `/admin/integrations/${c.slug}`
      return (
        (c.slug === defaultSlug && pathname === '/admin/integrations') ||
        pathname === href ||
        pathname.startsWith(`${href}/`)
      )
    })?.slug ?? null

  return (
    <>
      <SidePanelColumn
        id="admin-integrations"
        title={t('Integration categories')}
        groups={groups}
        activeKey={activeKey}
        filterThreshold={Infinity}
      />
      <SidePanelMobilePicker
        title={t('Integration categories')}
        groups={groups}
        activeKey={activeKey}
        filterThreshold={Infinity}
        className="h-10 w-full max-w-none justify-between"
      />
    </>
  )
}
