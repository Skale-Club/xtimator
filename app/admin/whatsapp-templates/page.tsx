import { requireAdmin } from '@/lib/auth/admin-context'
import { T } from '@/components/i18n/t'
import { listTemplates } from '@/lib/actions/admin-whatsapp-templates'
import { WhatsAppTemplatesPanel } from '@/components/admin/whatsapp-templates-panel'

export const dynamic = 'force-dynamic'

export default async function AdminWhatsAppTemplatesPage() {
  // requireAdmin FIRST — the panel reads/writes via the service client which
  // bypasses RLS, so this gate is the real access control.
  await requireAdmin()

  const templates = await listTemplates()

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>WhatsApp Templates</T>
        </h1>
        <p className="text-muted-foreground">
          <T>
            Manage the Meta-approved WhatsApp templates that back proactive owner notifications.
            Approval status syncs automatically from Meta via the status webhook.
          </T>
        </p>
      </div>

      <WhatsAppTemplatesPanel templates={templates} />
    </div>
  )
}
