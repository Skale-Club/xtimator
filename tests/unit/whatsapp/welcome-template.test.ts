import { beforeEach, describe, expect, it, vi } from 'vitest'

type Variant = {
  language_code: string
  status: string
  meta_template_id?: string
  variables_schema?: unknown
  quick_reply_count?: number
}
const approved = (locale: string): Variant => ({
  language_code: locale,
  status: 'approved',
  meta_template_id: 'meta-1',
  variables_schema: [],
  quick_reply_count: 1,
})

const state = vi.hoisted(() => ({
  prefs: { whatsapp_opt_in_at: '2026-11-09T00:00:00Z' } as { whatsapp_opt_in_at: string | null } | null,
  sender: null as {
    id: string
    phone_e164: string
    welcome_template_sent_at: string | null
    welcome_template_needs_review?: boolean
  } | null,
  senderRows: [] as Array<{ company_id: string }>,
  trackedTemplates: [] as Variant[],
  authorized: true,
  language: 'pt' as 'pt' | 'en' | 'es',
  config: {
    templateNames: { pt: 'welcome_start_pt', en: 'welcome_start_en', es: null as string | null },
    videoUrls: { pt: null, en: null, es: null },
  } as Record<string, Record<string, string | null>>,
  claimWins: true,
  settlementFails: false,
  claimPatches: [] as Array<Record<string, unknown>>,
  releasePatches: [] as Array<Record<string, unknown>>,
  sendTemplate: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notifications/preferences', () => ({
  getUserPreferences: async () => state.prefs,
}))
vi.mock('@/lib/platform-config', () => ({
  getWhatsAppWelcomeConfig: async () => state.config,
  getWhatsAppPlatformConfig: async () => ({ accessToken: 'test-token', phoneNumberId: 'test-sender' }),
}))
vi.mock('@/lib/whatsapp/account-registry', () => ({ revalidateWhatsAppSender: async () => state.authorized }))
vi.mock('@/lib/whatsapp/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/whatsapp/client')>()),
  sendWhatsAppTemplate: state.sendTemplate,
}))
vi.mock('@/lib/whatsapp/send-welcome', () => ({
  resolveWelcomeLanguage: async () => state.language,
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (table: string) => {
      if (table === 'whatsapp_notification_templates') {
        return {
          select: () => ({
            eq: async () => ({ data: state.trackedTemplates, error: null }),
          }),
        }
      }
      // whatsapp_authorized_senders
      return {
        select: (cols: string) => {
          if (cols === 'company_id') {
            const chain = {
              eq: () => chain,
              limit: async () => ({ data: state.senderRows, error: null }),
            }
            return chain
          }
          const chain = {
            eq: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({ data: state.sender, error: null }),
          }
          return chain
        },
        update: (patch: Record<string, unknown>) => {
          const isRelease = patch.welcome_template_claim_until === null
          if (isRelease) state.releasePatches.push(patch)
          else state.claimPatches.push(patch)
          const chain = {
            eq: () => chain,
            is: () => chain,
            or: () => chain,
            select: async () => {
              if (isRelease && state.settlementFails) {
                return { data: null, error: { message: 'checkpoint failed' } }
              }
              if (!isRelease && !state.claimWins) return { data: [], error: null }
              if (state.sender) {
                state.sender.welcome_template_needs_review = patch.welcome_template_needs_review === true
                if (typeof patch.welcome_template_sent_at === 'string') {
                  state.sender.welcome_template_sent_at = patch.welcome_template_sent_at
                }
              }
              return { data: [{ id: 's1' }], error: null }
            },
          }
          return chain
        },
      }
    },
  }),
}))

import { sendWelcomeTemplate, sendWelcomeTemplateForUser } from '@/lib/whatsapp/welcome-template'
import { WhatsAppSendError } from '@/lib/whatsapp/client'

beforeEach(() => {
  state.prefs = { whatsapp_opt_in_at: '2026-11-09T00:00:00Z' }
  state.sender = { id: 's1', phone_e164: '+5511999990000', welcome_template_sent_at: null }
  state.senderRows = [{ company_id: 'c1' }]
  state.trackedTemplates = [approved('pt_BR'), approved('en_US')]
  state.authorized = true
  state.language = 'pt'
  state.config = {
    templateNames: { pt: 'welcome_start_pt', en: 'welcome_start_en', es: null },
    videoUrls: { pt: null, en: null, es: null },
  }
  state.claimWins = true
  state.settlementFails = false
  state.claimPatches = []
  state.releasePatches = []
  state.sendTemplate.mockReset()
  state.sendTemplate.mockResolvedValue('wamid.1')
})

describe('sendWelcomeTemplate', () => {
  it('sends the configured template, non-billable purpose welcome', async () => {
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('sent')
    expect(state.sendTemplate).toHaveBeenCalledTimes(1)
    expect(state.sendTemplate).toHaveBeenCalledWith(
      '+5511999990000',
      { name: 'welcome_start_pt', languageCode: 'pt_BR', quickReplyPayloads: ['xtimator_welcome_start'] },
      { companyId: 'c1', purpose: 'welcome', billable: false }
    )
    expect(state.claimPatches[0]).toEqual({
      welcome_template_claim_until: expect.any(String),
      welcome_template_needs_review: true,
    })
    expect(state.releasePatches[0]).toEqual({
      welcome_template_claim_until: null,
      welcome_template_needs_review: false,
      welcome_template_sent_at: expect.any(String),
    })
  })

  it('needs WhatsApp consent', async () => {
    state.prefs = { whatsapp_opt_in_at: null }
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('no_consent')
    state.prefs = null
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('no_consent')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })

  it('needs a linked active sender', async () => {
    state.sender = null
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('no_sender')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })

  it('is idempotent: never sends when the sender was already welcomed', async () => {
    state.sender = { id: 's1', phone_e164: '+5511999990000', welcome_template_sent_at: '2026-11-09T01:00:00Z' }
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('already_sent')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })

  it('is idempotent under a race: the loser of the atomic claim does not send', async () => {
    state.claimWins = false
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('already_sent')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })

  it('skips silently when no template is configured for the language', async () => {
    state.language = 'es'
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('no_template_configured')
    expect(state.sendTemplate).not.toHaveBeenCalled()
    expect(state.claimPatches).toHaveLength(0)
  })

  it('picks the template for the company language', async () => {
    state.language = 'en'
    await sendWelcomeTemplate('u1', 'c1')
    expect(state.sendTemplate.mock.calls[0]![1]).toEqual({
      name: 'welcome_start_en',
      languageCode: 'en_US',
      quickReplyPayloads: ['xtimator_welcome_start'],
    })
  })

  it('skips when the tracked template is not approved', async () => {
    state.trackedTemplates = [{ language_code: 'pt_BR', status: 'pending' }]
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('template_not_approved')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })

  it('requires approval of the exact locale and compatible components', async () => {
    state.trackedTemplates = [approved('en_US'), { ...approved('pt_BR'), quick_reply_count: 0 }]
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('template_not_approved')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })

  it('requires current sender authority even with consent and a stored active row', async () => {
    state.authorized = false
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('no_sender')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })

  it('releases the claim so a known Meta rejection can retry', async () => {
    state.sendTemplate.mockRejectedValueOnce(new WhatsAppSendError(429, 130429, 'rate limited'))
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('send_failed')
    expect(state.releasePatches).toEqual([{
      welcome_template_claim_until: null,
      welcome_template_needs_review: false,
    }])
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('sent')
    expect(state.sendTemplate).toHaveBeenCalledTimes(2)
  })

  it('holds an ambiguous transport failure for review across later triggers', async () => {
    state.sendTemplate.mockRejectedValueOnce(new Error('connection reset'))
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('needs_review')
    expect(state.releasePatches).toEqual([])
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('needs_review')
    expect(state.sendTemplate).toHaveBeenCalledOnce()
  })

  it('holds an accepted provider response for review when its settlement write fails', async () => {
    state.settlementFails = true
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('needs_review')
    expect(state.sender?.welcome_template_needs_review).toBe(true)
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('needs_review')
    expect(state.sendTemplate).toHaveBeenCalledOnce()
  })
})

describe('sendWelcomeTemplateForUser (consent trigger)', () => {
  it('tries each active sender company of the user', async () => {
    await sendWelcomeTemplateForUser('u1')
    expect(state.sendTemplate).toHaveBeenCalledTimes(1)
    expect(state.sendTemplate.mock.calls[0]![2]).toMatchObject({ companyId: 'c1', purpose: 'welcome', billable: false })
  })

  it('does nothing when the user has no active sender yet', async () => {
    state.senderRows = []
    await sendWelcomeTemplateForUser('u1')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })
})
