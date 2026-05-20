'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import {
  Activity,
  Clock,
  Cpu,
  DollarSign,
  FileText,
  MessageSquare,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { EventCategory } from '@/lib/notifications/event-types'

export const CATEGORY_ICONS: Record<EventCategory, LucideIcon> = {
  estimate: FileText,
  payment: DollarSign,
  trial: Clock,
  quota: Activity,
  whatsapp: MessageSquare,
  ai_job: Cpu,
  admin: ShieldCheck,
  system: Wrench,
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  estimate: 'Estimates',
  payment: 'Payments',
  trial: 'Trial',
  quota: 'Quota',
  whatsapp: 'WhatsApp',
  ai_job: 'AI Jobs',
  admin: 'Admin',
  system: 'System',
}

const ORDER: EventCategory[] = [
  'estimate',
  'payment',
  'trial',
  'quota',
  'whatsapp',
  'ai_job',
  'admin',
  'system',
]

export interface NotificationFiltersProps {
  category: EventCategory | null
  unreadOnly: boolean
  search: string
  onSearchChange: (v: string) => void
  /** Optional: emit raw filter changes (for tests). When omitted, falls back to URL nav. */
  onCategoryChange?: (next: EventCategory | null) => void
  onUnreadChange?: (next: boolean) => void
}

export function NotificationFilters({
  category,
  unreadOnly,
  search,
  onSearchChange,
  onCategoryChange,
  onUnreadChange,
}: NotificationFiltersProps) {
  const router = useRouter()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const pushParams = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(params?.toString() ?? '')
      sp.delete('cursor') // reset pagination on filter change
      mutate(sp)
      const qs = sp.toString()
      startTransition(() => {
        router.push(qs ? `/notifications?${qs}` : '/notifications')
      })
    },
    [params, router],
  )

  const setCategory = (next: EventCategory | null) => {
    if (onCategoryChange) {
      onCategoryChange(next)
      return
    }
    pushParams((sp) => {
      if (next) sp.set('category', next)
      else sp.delete('category')
    })
  }

  const setUnread = (next: boolean) => {
    if (onUnreadChange) {
      onUnreadChange(next)
      return
    }
    pushParams((sp) => {
      if (next) sp.set('unread', '1')
      else sp.delete('unread')
    })
  }

  return (
    <div
      data-testid="notification-filters"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={category === null}
          onClick={() => setCategory(null)}
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            category === null
              ? 'gradient-brand text-white border-transparent'
              : 'border-border text-foreground hover:bg-accent',
          )}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => setUnread(!unreadOnly)}
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            unreadOnly
              ? 'bg-primary text-primary-foreground border-transparent'
              : 'border-border text-foreground hover:bg-accent',
          )}
          data-testid="filter-unread"
        >
          Unread only
        </button>
        {ORDER.map((cat) => {
          const Icon = CATEGORY_ICONS[cat]
          const active = category === cat
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={active}
              data-testid={`filter-cat-${cat}`}
              onClick={() => setCategory(active ? null : cat)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'gradient-brand text-white border-transparent'
                  : 'border-border text-foreground hover:bg-accent',
              )}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {CATEGORY_LABELS[cat]}
            </button>
          )
        })}
      </div>

      <Input
        type="search"
        placeholder="Search notifications…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        data-testid="filter-search"
        className="max-w-md"
      />
    </div>
  )
}

// Helper used by list rows
export function categoryIconFor(category: EventCategory): LucideIcon {
  return CATEGORY_ICONS[category]
}

// re-export Badge so consumers don't need a second import
export { Badge }
