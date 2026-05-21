import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import {
  WhatsAppConnectCard,
  type WhatsAppStatus,
} from '@/components/settings/whatsapp-connect-card'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export default async function SettingsIntegrationsPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) redirect('/onboarding')

  const { data: wa } = await supabase
    .from('company_whatsapp')
    .select('phone_number, phone_number_id, waba_id, status, delivery_format')
    .eq('company_id', company.id)
    .maybeSingle()

  const whatsAppStatus: WhatsAppStatus = wa
    ? {
        phoneNumber: wa.phone_number,
        phoneNumberId: wa.phone_number_id,
        wabaId: wa.waba_id,
        status: wa.status,
        deliveryFormat: (wa.delivery_format ?? 'share_link') as 'share_link' | 'formatted_text',
      }
    : null

  return (
    <div className="space-y-8 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Integrations</T>
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          <T>Connect third-party services to extend how estimates are created and delivered.</T>
        </p>
      </header>

      <Card variant="glass" className="p-6 md:p-8">
        <WhatsAppConnectCard initial={whatsAppStatus} />
      </Card>
    </div>
  )
}
