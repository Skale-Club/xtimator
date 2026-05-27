import { T } from '@/components/i18n/t'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import {
  WhatsAppConnectCard,
  type WhatsAppStatus,
} from '@/components/settings/whatsapp-connect-card'

export const metadata = { title: 'WhatsApp | Settings' }

export default async function SettingsWhatsAppPage() {
  const companyId = await getActiveCompanyId()

  let initial: WhatsAppStatus = null
  if (companyId) {
    const supabase = await createClient()
    const { data: row } = await supabase
      .from('company_whatsapp')
      .select('phone_number, phone_number_id, waba_id, status, delivery_format')
      .eq('company_id', companyId)
      .maybeSingle()

    if (row) {
      initial = {
        phoneNumber: row.phone_number as string,
        phoneNumberId: row.phone_number_id as string,
        wabaId: row.waba_id as string,
        status: row.status as string,
        deliveryFormat: row.delivery_format as
          | 'share_link'
          | 'formatted_text'
          | 'pdf_attachment',
      }
    }
  }

  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>WhatsApp</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Connect a WhatsApp Business number to send estimates and receive client messages.</T>
        </p>
      </header>

      <section className="space-y-4">
        <WhatsAppConnectCard initial={initial} />
      </section>
    </div>
  )
}
