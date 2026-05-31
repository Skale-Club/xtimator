// Wave 0 RED scaffold for the server-side gate formula used by Wave 1
// (in both app/(app)/projects/[id]/page.tsx for whatsappSendEnabled
// and app/api/estimates/[id]/send-whatsapp/route.ts for the 402/409 check).
import { describe, it } from 'vitest'

describe('whatsappSendEnabled gate formula', () => {
  it.todo('returns true when tier=trial AND company_whatsapp.status === "active"')
  it.todo('returns true when tier=pro AND company_whatsapp.status === "active"')
  it.todo('returns true when tier=business AND company_whatsapp.status === "active"')
  it.todo('returns false when tier=free regardless of status (whatsappEnabled=false on free)')
  it.todo('returns false when tier=pro AND company_whatsapp.status === "pending"')
  it.todo('returns false when tier=pro AND company_whatsapp.status === "suspended"')
  it.todo('returns false when tier=pro AND no company_whatsapp row exists')
})
