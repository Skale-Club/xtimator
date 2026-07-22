import { requireAdmin } from '@/lib/auth/admin-context'
import { listNotificationTemplates } from '@/lib/actions/admin-notification-templates'
import { NotificationTemplatesPanel } from '@/components/admin/notification-templates-panel'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

export default async function AdminNotificationsPage() {
  // requireAdmin FIRST — listNotificationTemplates reads via the service
  // client, which bypasses RLS, so this gate is the real access control
  // (same posture as app/admin/inbox/settings/page.tsx).
  await requireAdmin()

  const templates = await listNotificationTemplates('tenant')

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Notification Center</T>
        </h1>
        <p className="text-muted-foreground">
          <T>
            Manage per-event notification copy, live-preview it against sample data, and test-send
            before publishing.
          </T>
        </p>
      </div>

      <NotificationTemplatesPanel initialTemplates={templates} />
    </div>
  )
}
