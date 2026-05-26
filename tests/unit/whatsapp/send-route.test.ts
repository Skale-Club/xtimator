// Wave 0 RED scaffold for POST /api/estimates/[id]/send-whatsapp.
// Wave 1 (plan 81-02) will:
//   - create app/api/estimates/[id]/send-whatsapp/route.ts
//   - replace every it.todo below with a real it(...) that imports and exercises POST.
import { describe, it } from 'vitest'

describe('POST /api/estimates/[id]/send-whatsapp', () => {
  it.todo('returns 401 when getClaims returns null')
  it.todo('returns 400 when phone fails E.164 regex')
  it.todo('returns 409 when estimate.workflow_status !== "consolidated"')
  it.todo('returns 402 when getEntitlements(tier).whatsappEnabled === false')
  it.todo('returns 409 when company_whatsapp.status !== "active"')
  it.todo('branches into share_link when delivery_format === "share_link" (sendWhatsAppMessage called with type:"text", body containing share URL)')
  it.todo('branches into formatted_text when delivery_format === "formatted_text" (formatEstimateForWhatsApp called, sendWhatsAppMessage type:"text")')
  it.todo('branches into pdf_attachment when delivery_format === "pdf_attachment" (generateAndUploadEstimatePDF called, sendWhatsAppMessage type:"document")')
  it.todo('pdf fallback: when generateAndUploadEstimatePDF throws, falls back to share_link AND response includes fallback: "share_link"')
  it.todo('logs delivery: inserts estimate_deliveries row with channel="whatsapp", provider="meta", status="sent", recipient_phone=to')
  it.todo('logs activity: inserts estimate_activity row with event_type="estimate_sent" and metadata.channel="whatsapp"')
  it.todo('updates estimates.sent_at if currently null')
})
