import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getUserPreferences } from '@/lib/notifications/preferences'
import { DEFAULT_PREFERENCES } from '@/lib/notifications/event-types'
import { NotificationsForm } from '@/components/settings/notifications-form'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Notifications | Settings' }

export default async function NotificationsTabPage() {
  const claims = await getAuthClaims()
  if (!claims?.sub) redirect('/?auth=login')

  const prefs = await getUserPreferences(claims.sub as string)
  const initial = {
    categories: (prefs?.categories ?? {}) as Record<
      string,
      { in_app?: boolean; email?: boolean }
    >,
    email_digest_enabled: prefs?.email_digest_enabled ?? true,
    push_enabled: !!prefs?.push_subscription,
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Notification preferences</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Choose how you want to be notified for each event category.</T>
        </p>
      </header>
      <NotificationsForm initial={initial} defaults={DEFAULT_PREFERENCES} />
    </div>
  )
}
