// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ service: vi.fn(), send: vi.fn(), stage: vi.fn(), statuses: vi.fn(), template: vi.fn(), authority: vi.fn(), process: vi.fn(), plan: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: mocks.service }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mocks.send } }))
vi.mock('@/lib/whatsapp/stage-inbound', () => ({ stageInboundMessage: mocks.stage }))
vi.mock('@/lib/whatsapp/template-status', () => ({ applyTemplateStatusUpdate: mocks.template }))
vi.mock('@/lib/billing/messaging-cost', () => ({ applyWhatsAppStatuses: mocks.statuses }))
vi.mock('@/lib/whatsapp/account-registry', () => ({ findActiveWhatsAppSender: mocks.authority }))
vi.mock('@/lib/whatsapp/handler', () => ({ processDurableInboundBatch: mocks.process, planDurableInboundRoute: mocks.plan }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ getWhatsAppPlatformConfig: vi.fn().mockResolvedValue({ phoneNumberId: 'platform-phone', wabaId: 'platform-waba' }) }))
vi.mock('@/lib/demo/guard', () => ({ assertCompanyWritable: vi.fn().mockResolvedValue(null) }))
import { acceptWhatsAppWebhook, processWhatsAppWebhook, processWhatsAppIngressBatch, recoverWhatsAppIngress } from '@/lib/whatsapp/durable-ingress'

let db: ReturnType<typeof fakeService>
function fakeService() {
  const writes: Array<{ table: string; patch: Record<string, unknown> }> = []
  const rpc = vi.fn()
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const readAttempt = vi.fn().mockResolvedValue({ data: { attempts: 1 }, error: null })
  const attemptQuery = { eq: vi.fn(), maybeSingle: readAttempt }
  attemptQuery.eq.mockReturnValue(attemptQuery)
  const chain: Record<string, any> = {}
  for (const method of ['eq','neq','lte','or','order','lt','limit','in','is','gte','select','maybeSingle']) chain[method] = vi.fn(() => chain)
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
  const from = vi.fn((table: string) => ({
    upsert,
    update: (patch: Record<string, unknown>) => { writes.push({ table, patch }); return chain },
    select: (columns: string) => table === 'whatsapp_webhook_inbox' && columns === 'attempts'
      ? attemptQuery : chain,
  }))
  return { from, rpc, upsert, writes, readAttempt, attemptQuery }
}
const message = { id: 'wamid.one', from: '15555550100', type: 'text', text: { body: 'Paint' } }
const phone = { companyId: 'c1', ownerPhone: '+15555550100' }
beforeEach(() => {
  vi.clearAllMocks(); db = fakeService(); mocks.service.mockReturnValue(db)
  mocks.send.mockResolvedValue({ ids: ['accepted'] }); mocks.stage.mockResolvedValue(phone)
  mocks.statuses.mockResolvedValue(undefined); mocks.template.mockResolvedValue(undefined)
  mocks.authority.mockResolvedValue({ ...phone, userId: 'u1' }); mocks.process.mockResolvedValue(undefined)
  mocks.plan.mockResolvedValue({ kind: 'create' })
})

describe('durable webhook acceptance', () => {
  it('commits the immutable row before publishing the worker event', async () => {
    const order: string[] = []
    db.upsert.mockImplementation(async () => { order.push('committed'); return { error: null } })
    mocks.send.mockImplementation(async () => { order.push('published') })
    const id = await acceptWhatsAppWebhook('{"entry":[]}', { entry: [] } as never)
    expect(id).toMatch(/^[a-f0-9]{64}$/); expect(order).toEqual(['committed','published'])
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ id }), { onConflict: 'id', ignoreDuplicates: true })
  })
  it('a transport outage leaves committed work recoverable, with a stable duplicate ID', async () => {
    mocks.send.mockRejectedValue(new Error('transport offline'))
    const one = await acceptWhatsAppWebhook('same signed body', { entry: [] } as never)
    expect(await acceptWhatsAppWebhook('same signed body', { entry: [] } as never)).toBe(one)
    expect(db.writes).toEqual([])
  })
  it('a database failure never publishes a worker event', async () => {
    db.upsert.mockResolvedValue({ error: { code: 'unavailable' } })
    await expect(acceptWhatsAppWebhook('body', {} as never)).rejects.toThrow('persistence')
    expect(mocks.send).not.toHaveBeenCalled()
  })
})

describe('independent changes and recoverable staging', () => {
  it('processes all statuses, templates and inbound messages from the same delivery', async () => {
    db.rpc.mockResolvedValue({ data: { entry: [{ id: 'platform-waba', changes: [
      { value: { metadata: { phone_number_id: 'platform-phone' }, statuses: [{ id: 'out', status: 'read' }], messages: [message] } },
      { field: 'message_template_status_update', value: { event: 'APPROVED', message_template_id: 'template-1' } },
      { field: 'message_template_status_update', value: { event: 'PAUSED', message_template_id: 'template-2' } },
      { value: { metadata: { phone_number_id: 'platform-phone' }, messages: [{ ...message, id: 'wamid.two' }] } },
    ] }] }, error: null })
    await processWhatsAppWebhook('inbox-id')
    expect(mocks.statuses).toHaveBeenCalledWith([{ id: 'out', status: 'read' }], { strict: true })
    expect(mocks.template).toHaveBeenCalledTimes(2); expect(mocks.stage).toHaveBeenCalledTimes(2)
    expect(mocks.stage).toHaveBeenCalledWith(message, expect.anything(), { recovering: false })
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(db.writes.at(-1)?.patch.state).toBe('complete')
  })
  it('keeps a failed dispatch pending rather than marking the delivery complete', async () => {
    db.rpc.mockResolvedValue({ data: { entry: [{ id: 'platform-waba', changes: [{ value: { metadata: { phone_number_id: 'platform-phone' }, messages: [message] } }] }] }, error: null })
    mocks.send.mockRejectedValue(new Error('queue unavailable'))
    await expect(processWhatsAppWebhook('inbox-id')).rejects.toThrow('items pending retry')
    expect(db.writes.at(-1)?.patch.state).toBe('pending')
    expect(db.writes.some(w => w.patch.state === 'complete')).toBe(false)
  })
  it('does not perform effects while another worker holds the lease', async () => {
    db.rpc.mockResolvedValue({ data: null, error: null })
    await processWhatsAppWebhook('inbox-id')
    expect(mocks.stage).not.toHaveBeenCalled(); expect(db.writes).toEqual([])
  })
  it('marks admission recovery only from the durable inbox attempt and current lease', async () => {
    db.rpc.mockResolvedValue({ data: { entry: [{ id: 'platform-waba', changes: [
      { value: { metadata: { phone_number_id: 'platform-phone' }, messages: [message] } },
    ] }] }, error: null })
    db.readAttempt.mockResolvedValue({ data: { attempts: 3 }, error: null })
    await processWhatsAppWebhook('inbox-id')
    const [, args] = db.rpc.mock.calls[0]
    expect(db.attemptQuery.eq).toHaveBeenCalledWith('id', 'inbox-id')
    expect(db.attemptQuery.eq).toHaveBeenCalledWith('lease_token', args.p_lease_token)
    expect(mocks.stage).toHaveBeenCalledWith(message, expect.anything(), { recovering: true })
  })
  it('keeps the webhook pending when the durable attempt cannot be read', async () => {
    db.rpc.mockResolvedValue({ data: { entry: [] }, error: null })
    db.readAttempt.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    await expect(processWhatsAppWebhook('inbox-id')).rejects.toThrow('attempt lookup failed')
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(db.writes.at(-1)?.patch.state).toBe('pending')
  })
  it('stages and dispatches messages despite an unrelated status/template failure', async () => {
    db.rpc.mockResolvedValue({ data: { entry: [{ id: 'platform-waba', changes: [
      { value: { metadata: { phone_number_id: 'platform-phone' }, statuses: [{ id: 'out' }], messages: [message] } },
      { field: 'message_template_status_update', value: { event: 'APPROVED', message_template_id: 'template-1' } },
      { value: { metadata: { phone_number_id: 'platform-phone' }, messages: [{ ...message, id: 'wamid.two' }] } },
    ] }] }, error: null })
    mocks.statuses.mockRejectedValue(new Error('status DB down'))
    mocks.template.mockRejectedValue(new Error('registry DB down'))
    await expect(processWhatsAppWebhook('inbox-id')).rejects.toThrow('items pending retry')
    expect(mocks.stage).toHaveBeenCalledTimes(2)
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(db.writes.at(-1)?.patch.state).toBe('pending')
  })
  it('ignores a validly signed delivery for another WABA or business number', async () => {
    db.rpc.mockResolvedValue({ data: { entry: [
      { id: 'someone-elses-waba', changes: [{ value: { metadata: { phone_number_id: 'platform-phone' }, messages: [message] } }] },
      { id: 'platform-waba', changes: [{ value: { metadata: { phone_number_id: 'someone-elses-phone' }, messages: [message] } }] },
    ] }, error: null })
    await processWhatsAppWebhook('inbox-id')
    expect(mocks.stage).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled()
  })
})

describe('durable message batching', () => {
  const batch = { id: 'b1', ...phone, senderUserId: 'u1', entries: [{ message, senderUserId: 'u1' }] }
  it('revalidates identity before dispatch and passes the stable batch identity', async () => {
    db.rpc.mockResolvedValue({ data: batch, error: null })
    await processWhatsAppIngressBatch(phone)
    expect(mocks.process).toHaveBeenCalledWith([message], 'c1', '15555550100', db, { batchKey: 'wa-ingress-b1', senderUserId: 'u1', route: { kind: 'create' } })
    expect(db.writes.at(-1)?.patch.state).toBe('complete')
  })
  it('never forwards queued work to a new account owning the same phone', async () => {
    db.rpc.mockResolvedValue({ data: batch, error: null })
    mocks.authority.mockResolvedValue({ ...phone, userId: 'different-user' })
    await processWhatsAppIngressBatch(phone)
    expect(mocks.process).not.toHaveBeenCalled(); expect(db.writes.at(-1)?.patch.state).toBe('revoked')
  })
  it('reuses the frozen route after dispatch succeeded but completion was not saved', async () => {
    db.rpc.mockResolvedValue({ data: { ...batch, route: { kind: 'create' } }, error: null })
    mocks.plan.mockResolvedValue({ kind: 'intent', session: { id: 'new-draft' } })
    await processWhatsAppIngressBatch(phone)
    expect(mocks.plan).not.toHaveBeenCalled()
    expect(mocks.process).toHaveBeenCalledWith([message], 'c1', '15555550100', db,
      expect.objectContaining({ route: { kind: 'create' }, batchKey: 'wa-ingress-b1' }))
  })
  it('keeps the immutable batch recoverable after a queue exception', async () => {
    db.rpc.mockResolvedValue({ data: batch, error: null }); mocks.process.mockRejectedValue(new Error('dispatch down'))
    await expect(processWhatsAppIngressBatch(phone)).rejects.toThrow('dispatch down')
    expect(db.writes.at(-1)?.patch.state).toBe('pending')
  })
  it('recovery republishes orphaned phone groups using a new bounded identity', async () => {
    db.rpc.mockResolvedValue({ data: [{ company_id: 'c1', owner_phone: phone.ownerPhone }], error: null })
    await recoverWhatsAppIngress()
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ name: 'whatsapp/ingress.ready', data: phone }))
  })
})
