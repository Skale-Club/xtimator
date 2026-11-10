import { beforeEach, describe, expect, it, vi } from 'vitest'

type Sender = { id: string; phone_e164: string; welcome_template_sent_at: string | null }

const state = vi.hoisted(() => ({
  prefs: { whatsapp_opt_in_at: '2026-11-09T00:00:00Z' } as { whatsapp_opt_in_at: string | null } | null,
  sender: null as { id: string; phone_e164: string; welcome_template_sent_at: string | null } | null,
  senderRows: [] as Array<{ company_id: string }>,
  trackedTemplates: [] as Array<{ language_code: string; status: string }>,
  language: 'pt' as 'pt' | 'en' | 'es',
  config: {
    templateNames: { pt: 'welcome_start_pt', en: 'welcome_start_en', es: null as string | null },
    videoUrls: { pt: null, en: null, es: null },
  } as Record<string, Record<string, string | null>>,
  claimWins: true,
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
}))
vi.mock('@/lib/whatsapp/client', () => ({
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
          const isRelease = patch.welcome_template_sent_at === null
          if (isRelease) state.releasePatches.push(patch)
          else state.claimPatches.push(patch)
          return {
            eq: () => ({
              is: () => ({
                select: async () => ({
                  data: state.claimWins ? [{ id: 's1' }] : [],
                  error: null,
                }),
              }),
              then: (resolve: (v: unknown) => void) => resolve({ error: null }),
            }),
          }
        },
      }
    },
  }),
}))

import { sendWelcomeTemplate, sendWelcomeTemplateForUser } from '@/lib/whatsapp/welcome-template'

beforeEach(() => {
  state.prefs = { whatsapp_opt_in_at: '2026-11-09T00:00:00Z' }
  state.sender = { id: 's1', phone_e164: '+5511999990000', welcome_template_sent_at: null }
  state.senderRows = [{ company_id: 'c1' }]
  state.trackedTemplates = []
  state.language = 'pt'
  state.config = {
    templateNames: { pt: 'welcome_start_pt', en: 'welcome_start_en', es: null },
    videoUrls: { pt: null, en: null, es: null },
  }
  state.claimWins = true
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
      { name: 'welcome_start_pt', languageCode: 'pt_BR' },
      { companyId: 'c1', purpose: 'welcome', billable: false }
    )
    expect(state.claimPatches[0]).toEqual({ welcome_template_sent_at: expect.any(String) })
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
    })
  })

  it('skips when the tracked template is not approved', async () => {
    state.trackedTemplates = [{ language_code: 'pt_BR', status: 'pending' }]
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('template_not_approved')
    expect(state.sendTemplate).not.toHaveBeenCalled()
  })

  it('uses the approved tracked row language code', async () => {
    state.trackedTemplates = [
      { language_code: 'pt_PT', status: 'rejected' },
      { language_code: 'pt', status: 'approved' },
    ]
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('sent')
    expect(state.sendTemplate.mock.calls[0]![1].languageCode).toBe('pt')
  })

  it('releases the claim and never throws when the send fails', async () => {
    state.sendTemplate.mockRejectedValue(new Error('meta 400'))
    await expect(sendWelcomeTemplate('u1', 'c1')).resolves.toBe('send_failed')
    expect(state.releasePatches).toEqual([{ welcome_template_sent_at: null }])
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
