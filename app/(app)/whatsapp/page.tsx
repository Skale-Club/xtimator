import { listConversations } from '@/lib/queries/whatsapp-inbox'
import { WhatsAppInbox } from '@/components/whatsapp/whatsapp-inbox'

export const metadata = { title: 'WhatsApp' }

// Conversations change as messages arrive; always render fresh.
export const dynamic = 'force-dynamic'

export default async function WhatsAppPage() {
  const conversations = await listConversations()
  return <WhatsAppInbox initialConversations={conversations} />
}
