import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { whatsAppWelcomeJob } from '@/lib/inngest/functions/whatsapp-welcome'

/**
 * Phase 98 — whatsAppWelcomeJob contract.
 *
 * Mirrors the source-assertion style of whatsapp-process-job.test.ts: the worker
 * is thin orchestration over already-tested pieces (claimWhatsAppWelcome's
 * send-once gating is covered by sync-owner-phone.test.ts; the sendWhatsAppTemplate
 * payload by template-send.test.ts), so we assert the wiring contract here.
 */

const src = readFileSync(
  resolve(process.cwd(), 'lib/inngest/functions/whatsapp-welcome.ts'),
  'utf8',
)

type FnInternals = { opts: { id: string; idempotency?: string } }

describe('Phase 98: whatsAppWelcomeJob', () => {
  it('is created with id "whatsapp-welcome" and idempotency on companyId', () => {
    const fn = whatsAppWelcomeJob as unknown as FnInternals
    expect(fn.opts.id).toBe('whatsapp-welcome')
    expect(fn.opts.idempotency).toBe('event.data.companyId')
  })

  it('is triggered by the whatsapp/welcome.requested event', () => {
    expect(src).toMatch(/EVENT_WHATSAPP_WELCOME/)
  })

  it('claims the welcome slot (send-once) and no-ops when already welcomed', () => {
    expect(src).toMatch(/claimWhatsAppWelcome\(/)
    expect(src).toMatch(/if \(!claimed\) return/)
  })

  it('sends the approved welcome TEMPLATE via sendWhatsAppTemplate', () => {
    expect(src).toMatch(/sendWhatsAppTemplate\(/)
    expect(src).toMatch(/name:\s*WELCOME_TEMPLATE_NAME/)
    expect(src).toMatch(/languageCode:\s*WELCOME_TEMPLATE_LANG/)
  })

  it('is best-effort: catches send failures instead of throwing (no retry storm)', () => {
    expect(src).toMatch(/catch\s*\(/)
    expect(src).toMatch(/send_failed/)
  })
})
