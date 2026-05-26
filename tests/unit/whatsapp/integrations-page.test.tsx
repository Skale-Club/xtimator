// Wave 0 RED scaffold for app/(app)/settings/integrations/page.tsx.
// Wave 1 (plan 81-03) will replace the placeholder body with a server component
// that mounts <WhatsAppConnectCard initial={initial} />.
import { describe, it } from 'vitest'

describe('Settings → Integrations page', () => {
  it.todo('header copy: H1 reads "Integrations"')
  it.todo('header copy: subhead reads "Connect outbound channels for sending estimates and receiving client messages."')
  it.todo('mounts WhatsAppConnectCard with initial={null} when company has no company_whatsapp row (not connected)')
  it.todo('mounts WhatsAppConnectCard with initial={{...}} when company_whatsapp row exists (connected)')
  it.todo('does NOT render the old "OpenRouter integration coming soon" placeholder text')
})
