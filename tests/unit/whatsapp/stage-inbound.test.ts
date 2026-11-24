// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ service: vi.fn(), find: vi.fn(), candidate: vi.fn(), ensure: vi.fn(), guard: vi.fn(), rate: vi.fn(), send: vi.fn(), log: vi.fn(), welcome: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: mock.service }))
vi.mock('@/lib/whatsapp/account-registry', () => ({ findActiveWhatsAppSender: mock.find }))
vi.mock('@/lib/whatsapp/sender-link', () => ({ findOwnerCandidateByVerifiedPhone: mock.candidate, ensureWhatsAppSenderForUser: mock.ensure }))
vi.mock('@/lib/demo/guard', () => ({ assertCompanyWritable: mock.guard }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: mock.rate }))
vi.mock('@/lib/whatsapp/client', () => ({ sendWhatsAppMessage: mock.send }))
vi.mock('@/lib/whatsapp/conversations', () => ({ logInboundMessage: mock.log }))
vi.mock('@/lib/whatsapp/send-welcome', () => ({ welcomeOnFirstContact: mock.welcome }))
vi.mock('@/lib/whatsapp/welcome-template', () => ({ WELCOME_QUICK_REPLY_PAYLOAD: 'xtimator_welcome_start' }))
import { stageInboundMessage } from '@/lib/whatsapp/stage-inbound'

type Row = Record<string, any>
let tables: Record<string, Row[]>
let upserts: Array<Row>
let failure: string | undefined
const owner = { companyId: 'company-one', userId: 'owner-one', phoneE164: '+15555550100' }
const message = { id: 'wamid.one', from: '15555550100', timestamp: '1', type: 'text', text: { body: 'Paint' } } as const
beforeEach(() => {
  vi.clearAllMocks(); tables = {}; upserts = []; failure = undefined
  mock.find.mockResolvedValue(owner); mock.candidate.mockResolvedValue(null); mock.ensure.mockResolvedValue({ status: 'linked' })
  mock.guard.mockResolvedValue(null); mock.rate.mockResolvedValue({ allowed: true }); mock.send.mockResolvedValue('wamid.reply')
  mock.log.mockResolvedValue('conversation'); mock.welcome.mockResolvedValue(false)
  mock.service.mockReturnValue({ from: (table: string) => {
    const filters: Array<[string, unknown]> = []; let cap = Infinity
    const run = () => ({ data: (tables[table] ?? []).filter(row => filters.every(([k,v]) => row[k] === v)).slice(0,cap), error: failure === table ? { code: 'unavailable' } : null })
    const b: Record<string, any> = {
      select: () => b, order: () => b, eq: (k: string,v: unknown) => { filters.push([k,v]); return b },
      limit: (n: number) => { cap = n; return b },
      maybeSingle: async () => { const r = run(); return { ...r, data: r.data[0] ?? null } },
      then: (resolve: (x: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      upsert: async (row: Row) => {
        if (failure === table || failure === `${table}:write`) return { error: { code: 'unavailable' } }
        tables[table] ??= []
        if (!tables[table].some(r => r.id === row.id)) { tables[table].push(row); upserts.push(row) }
        return { error: null }
      },
    }
    return b
  } })
})
it('persists an authorized owner with immutable actor provenance and does not dispatch AI', async () => {
  expect(await stageInboundMessage(message, undefined)).toEqual({ companyId: owner.companyId, ownerPhone: owner.phoneE164 })
  expect(upserts).toEqual([expect.objectContaining({ id: message.id, sender_user_id: owner.userId, message })])
  expect(mock.find).toHaveBeenCalledWith(owner.phoneE164, { throwOnError: true })
})
it('duplicate delivery returns the same durable group without spending another rate-limit or welcome slot', async () => {
  await stageInboundMessage(message, undefined); await stageInboundMessage(message, undefined)
  expect(upserts).toHaveLength(1); expect(mock.welcome).toHaveBeenCalledOnce(); expect(mock.rate).toHaveBeenCalledTimes(2)
})
it('an authority outage remains retryable and never falls through into unknown-sender replies', async () => {
  mock.find.mockRejectedValue(new Error('authority unavailable'))
  await expect(stageInboundMessage(message, undefined)).rejects.toThrow('authority unavailable')
  expect(mock.send).not.toHaveBeenCalled(); expect(upserts).toEqual([])
})
it('rejects missing-phone identities safely without inventing a phone/account mapping', async () => {
  await stageInboundMessage({ ...message, from: undefined, from_user_id: 'business-scoped-user' }, undefined)
  expect(mock.find).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled(); expect(upserts).toEqual([])
})
it('customer messages are logged but never enter the owner-processing queue', async () => {
  mock.find.mockResolvedValue(null)
  tables.clients = [{ company_id: 'company-one', phone: owner.phoneE164 }]
  await stageInboundMessage(message, undefined)
  expect(mock.log).toHaveBeenCalledOnce(); expect(mock.welcome).not.toHaveBeenCalled(); expect(upserts).toEqual([])
})
it('a client shared across companies is never guessed from partial conversation results', async () => {
  mock.find.mockResolvedValue(null)
  tables.whatsapp_conversations = [
    { company_id: 'company-one', contact_phone: owner.phoneE164 },
    { company_id: 'company-two', contact_phone: owner.phoneE164 },
  ]
  tables.clients = [{ company_id: 'company-one', phone: owner.phoneE164 }]
  await stageInboundMessage(message, undefined)
  expect(mock.log).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled(); expect(upserts).toEqual([])
})
it('retries failed durable staging without consuming owner admission counters twice', async () => {
  failure = 'whatsapp_ingress_messages:write'
  await expect(stageInboundMessage(message, undefined)).rejects.toThrow('persistence failed')
  expect(tables.whatsapp_processed_messages).toBeUndefined()
  expect(mock.rate.mock.calls).toEqual([
    ['whatsappPerHour', message.from], ['whatsappPerDay', message.from],
  ])
  failure = undefined
  mock.rate.mockClear().mockResolvedValue({ allowed: false })
  await expect(stageInboundMessage(message, undefined, { recovering: true }))
    .resolves.toEqual({ companyId: owner.companyId, ownerPhone: owner.phoneE164 })
  expect(mock.rate).not.toHaveBeenCalled()
  expect(upserts).toHaveLength(1)
})
it('still rejects a rate-limited first delivery', async () => {
  mock.rate.mockResolvedValue({ allowed: false })
  await expect(stageInboundMessage(message, undefined, { recovering: false })).resolves.toBeUndefined()
  expect(mock.rate).toHaveBeenCalledExactlyOnceWith('whatsappPerHour', message.from)
  expect(mock.log).not.toHaveBeenCalled()
  expect(upserts).toEqual([])
})
it('still rate-limits unknown-sender replies during inbox recovery', async () => {
  mock.find.mockResolvedValue(null)
  mock.rate.mockResolvedValue({ allowed: false })
  await stageInboundMessage(message, undefined, { recovering: true })
  expect(mock.rate).toHaveBeenCalledExactlyOnceWith('whatsappUnknownSenderReply', message.from)
  expect(mock.send).not.toHaveBeenCalled()
})
it('consumes only the exact welcome control button, even if the welcome was deferred', async () => {
  await stageInboundMessage({ ...message, type: 'button', button: { text: 'Get started', payload: 'xtimator_welcome_start' } }, undefined)
  expect(upserts).toEqual([])
  await stageInboundMessage({ ...message, type: 'button', button: { text: 'Paint', payload: 'some-other-button' } }, undefined)
  expect(upserts).toHaveLength(1)
})
