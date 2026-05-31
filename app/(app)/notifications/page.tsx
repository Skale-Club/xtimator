import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { listNotificationsPage } from '@/lib/notifications/queries'
import {
  EVENT_CATEGORIES,
  type EventCategory,
} from '@/lib/notifications/event-types'
import { NotificationList } from '@/components/notifications/NotificationList'

export const metadata = { title: 'Notifications' }

const PAGE_SIZE = 50

function parseCategory(raw: string | undefined): EventCategory | null {
  if (!raw) return null
  // Derive category set from EVENT_CATEGORIES to avoid drift.
  const known = new Set(Object.values(EVENT_CATEGORIES))
  return known.has(raw as EventCategory) ? (raw as EventCategory) : null
}

interface PageProps {
  searchParams?: Promise<{
    category?: string
    unread?: string
    cursor?: string
  }>
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()
  if (!company) redirect('/onboarding')

  const sp = (await searchParams) ?? {}
  const category = parseCategory(sp.category)
  const unreadOnly = sp.unread === '1'
  const cursor = sp.cursor ?? null

  const { items, nextCursor } = await listNotificationsPage({
    companyId: company.id as string,
    userId: claims.sub as string,
    category,
    unreadOnly,
    cursor,
    limit: PAGE_SIZE,
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <NotificationList
        items={items}
        nextCursor={nextCursor}
        category={category}
        unreadOnly={unreadOnly}
      />
    </div>
  )
}
