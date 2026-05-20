import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getUserPreferences } from '@/lib/notifications/preferences'
import { DEFAULT_PREFERENCES } from '@/lib/notifications/event-types'
import { NotificationsForm } from '@/components/settings/notifications-form'

export const metadata = { title: 'Notifications — Settings' }

export default async function NotificationsTabPage() {
  const claims = await getAuthClaims()
  if (!claims?.sub) redirect('/login')

  const prefs = await getUserPreferences(claims.sub as string)
  const initial = {
    categories: (prefs?.categories ?? {}) as Record<
      string,
      { in_app?: boolean; email?: boolean }
    >,
    email_digest_enabled: prefs?.email_digest_enabled ?? true,
    push_enabled: !!prefs?.push_subscription,
  }
  return <NotificationsForm initial={initial} defaults={DEFAULT_PREFERENCES} />
}
