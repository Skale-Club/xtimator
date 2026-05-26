// Wave 0 RED scaffold for the WhatsApp tab in components/workspace/send/send-form.tsx.
// Wave 1 (plan 81-03) will add the third TabsTrigger and TabsContent and replace
// every it.todo below with a real it(...).
import { describe, it } from 'vitest'

describe('SendForm — WhatsApp tab', () => {
  it.todo('renders tab when whatsappSendEnabled === true')
  it.todo('hides tab entirely when whatsappSendEnabled === false (no disabled trigger rendered)')
  it.todo('icon: tab trigger renders MessageCircle (not MessageSquare)')
  it.todo('tab order is Email, SMS, WhatsApp left-to-right when both smsDeliveryEnabled and whatsappSendEnabled are true')
  it.todo('phone field accepts +15551234567 and rejects 555-1234 (E.164 schema)')
  it.todo('submit posts to /api/estimates/[id]/send-whatsapp with { to, message } JSON body')
  it.todo('success toast reads "Estimate sent via WhatsApp!" on 200 response')
  it.todo('fallback toast: when API response includes fallback: "share_link", toast reads "PDF indisponível — enviamos o link"')
  it.todo('CTA disabled when parent passes disabled={true} (draft estimate)')
})
