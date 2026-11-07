import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getUserPreferences } from '@/lib/notifications/preferences'
import { resolveOwnerPhone } from '@/lib/notifications/owner-phone'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { DEFAULT_PREFERENCES } from '@/lib/notifications/event-types'
import { NotificationsForm } from '@/components/settings/notifications-form'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Notifications | Settings' }

export default async function NotificationsTabPage() {
  const claims = await getAuthClaims()
  if (!claims?.sub) redirect('/?auth=login')

  const userId = claims.sub as string
  const prefs = await getUserPreferences(userId)

  // Resolve the verified phone on file (drives WhatsApp/SMS toggle enablement)
  // for the active company. Best-effort — null when no company / no number.
  const companyId = await getActiveCompanyId()
  const verifiedPhone = companyId
    ? await resolveOwnerPhone(companyId, userId)
    : null

  const initial = {
    categories: (prefs?.categories ?? {}) as Record<
      string,
      { in_app?: boolean; email?: boolean; whatsapp?: boolean; sms?: boolean }
    >,
    email_digest_enabled: prefs?.email_digest_enabled ?? true,
    push_enabled: !!prefs?.push_subscription,
  }
  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>Notifications</T>}
        description={<T>Choose what you hear about and where.</T>}
      />
      <NotificationsForm
        initial={initial}
        defaults={DEFAULT_PREFERENCES}
        verifiedPhone={verifiedPhone}
        smsOptIn={!!prefs?.sms_opt_in_at}
        readOnly={isDemoCompany(companyId)}
      />
    </div>
  )
}
