import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

const DEMO_COMPANY_ID = '0000de00-0000-0000-0000-000000000001'
const NORMAL_COMPANY_ID = 'company-normal'
const READONLY_MESSAGE =
  'This is a read-only demo. Create a free account to make changes.'

const mocks = vi.hoisted(() => ({
  assertCompanyWritable: vi.fn(),
  getActiveCompanyId: vi.fn(),
  createServiceClient: vi.fn(),
  requireServiceClient: vi.fn(),
  createEstimate: vi.fn(),
  askKnowledge: vi.fn(),
  findClientByName: vi.fn(),
  getLatestEstimateForClient: vi.fn(),
  getProjectStatus: vi.fn(),
  findServiceByName: vi.fn(),
  listRecentEstimates: vi.fn(),
  listServices: vi.fn(),
  createPriceBookService: vi.fn(),
  addCompanyKnowledge: vi.fn(),
  createProject: vi.fn(),
  sendCustomerEmail: vi.fn(),
  sendCustomerSms: vi.fn(),
  resolveCustomerCopy: vi.fn(),
  logCustomerMessage: vi.fn(),
  resolveChannels: vi.fn(),
  resolveOwnerPhone: vi.fn(),
  getApprovedTemplateForEvent: vi.fn(),
  resolveNotificationCopy: vi.fn(),
  buildFullCopyContext: vi.fn(),
  inngestSend: vi.fn(),
  getStripeClient: vi.fn(),
  constructEvent: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  subscriptionsCancel: vi.fn(),
  setupIntentRetrieve: vi.fn(),
  customersUpdate: vi.fn(),
  resolveConnectEventCompanyId: vi.fn(),
  handleConnectEvent: vi.fn(),
  grantCredits: vi.fn(),
  monthGrantKey: vi.fn(),
  getBillingConfig: vi.fn(),
  resolveTierFromPriceId: vi.fn(),
  notifyOps: vi.fn(),
}))

vi.mock('@/lib/demo/guard', () => ({
  DEMO_READONLY_MESSAGE:
    'This is a read-only demo. Create a free account to make changes.',
  assertCompanyWritable: (...args: unknown[]) =>
    mocks.assertCompanyWritable(...args),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) =>
    mocks.getActiveCompanyId(...args),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: (...args: unknown[]) =>
    mocks.createServiceClient(...args),
  requireServiceClient: (...args: unknown[]) =>
    mocks.requireServiceClient(...args),
}))

vi.mock('@/lib/agent-tools', () => ({
  createEstimate: (...args: unknown[]) => mocks.createEstimate(...args),
  askKnowledge: (...args: unknown[]) => mocks.askKnowledge(...args),
  findClientByName: (...args: unknown[]) =>
    mocks.findClientByName(...args),
  getLatestEstimateForClient: (...args: unknown[]) =>
    mocks.getLatestEstimateForClient(...args),
  getProjectStatus: (...args: unknown[]) => mocks.getProjectStatus(...args),
  findServiceByName: (...args: unknown[]) =>
    mocks.findServiceByName(...args),
  listRecentEstimates: (...args: unknown[]) =>
    mocks.listRecentEstimates(...args),
  listServices: (...args: unknown[]) => mocks.listServices(...args),
  createPriceBookService: (...args: unknown[]) =>
    mocks.createPriceBookService(...args),
  addCompanyKnowledge: (...args: unknown[]) =>
    mocks.addCompanyKnowledge(...args),
  createProject: (...args: unknown[]) => mocks.createProject(...args),
}))

vi.mock('@/lib/email/customer-emails', () => ({
  sendCustomerEmail: (...args: unknown[]) =>
    mocks.sendCustomerEmail(...args),
}))

vi.mock('@/lib/sms/client', () => ({
  sendCustomerSms: (...args: unknown[]) => mocks.sendCustomerSms(...args),
}))

vi.mock('@/lib/notifications/customer-template-resolver', () => ({
  resolveCustomerCopy: (...args: unknown[]) =>
    mocks.resolveCustomerCopy(...args),
}))

vi.mock('@/lib/notifications/customer-message-log', () => ({
  logCustomerMessage: (...args: unknown[]) =>
    mocks.logCustomerMessage(...args),
}))

vi.mock('@/lib/notifications/preferences', () => ({
  resolveChannels: (...args: unknown[]) => mocks.resolveChannels(...args),
}))

vi.mock('@/lib/notifications/owner-phone', () => ({
  resolveOwnerPhone: (...args: unknown[]) =>
    mocks.resolveOwnerPhone(...args),
}))

vi.mock('@/lib/notifications/whatsapp-registry', () => ({
  getApprovedTemplateForEvent: (...args: unknown[]) =>
    mocks.getApprovedTemplateForEvent(...args),
}))

vi.mock('@/lib/notifications/template-resolver', () => ({
  resolveNotificationCopy: (...args: unknown[]) =>
    mocks.resolveNotificationCopy(...args),
}))

vi.mock('@/lib/notifications/copy-context', () => ({
  buildFullCopyContext: (...args: unknown[]) =>
    mocks.buildFullCopyContext(...args),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: (...args: unknown[]) => mocks.inngestSend(...args),
  },
}))

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: (...args: unknown[]) => mocks.getStripeClient(...args),
}))

vi.mock('@/lib/billing/connect-webhook', () => ({
  connectEventRequiresCompanyResolution: (event: { type?: string }) =>
    [
      'checkout.session.completed',
      'invoice.paid',
      'charge.refunded',
      'account.application.deauthorized',
      'account.updated',
    ].includes(event.type ?? ''),
  resolveConnectEventCompanyId: (...args: unknown[]) =>
    mocks.resolveConnectEventCompanyId(...args),
  handleConnectEvent: (...args: unknown[]) =>
    mocks.handleConnectEvent(...args),
}))

vi.mock('@/lib/billing/credit-ledger', () => ({
  grantCredits: (...args: unknown[]) => mocks.grantCredits(...args),
  monthGrantKey: (...args: unknown[]) => mocks.monthGrantKey(...args),
}))

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: (...args: unknown[]) =>
    mocks.getBillingConfig(...args),
}))

vi.mock('@/lib/billing/stripe-price-map', () => ({
  resolveTierFromPriceId: (...args: unknown[]) =>
    mocks.resolveTierFromPriceId(...args),
}))

vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: (...args: unknown[]) => mocks.notifyOps(...args),
}))

import {
  createConversation,
  listConversations,
} from '@/lib/queries/chat'
import { buildChatTools } from '@/lib/chat/tools'
import { sendCustomerMessage } from '@/lib/notifications/customer-send'
import { notify } from '@/lib/notifications/dispatch'
import { dispatchXphereSync } from '@/lib/integrations/xphere/dispatch'
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route'

type QueryResult = { data: unknown; error: null }

function makeQuery(result: QueryResult = { data: null, error: null }) {
  const chain: Record<string, unknown> = {}
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'gte',
    'contains',
    'order',
    'limit',
  ]) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(async () => result)
  chain.single = vi.fn(async () => result)
  chain.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return chain
}

function makeServiceClient(result?: QueryResult) {
  return {
    from: vi.fn(() => makeQuery(result)),
  } as unknown as SupabaseClient
}

function execTool(
  chatTool: { execute?: unknown },
  args: unknown,
): Promise<unknown> {
  const execute = chatTool.execute as (
    input: unknown,
    options: unknown,
  ) => Promise<unknown>
  return execute(args, { toolCallId: 'demo-boundary', messages: [] })
}

function makePermit(channel: 'email' | 'sms' = 'email') {
  return {
    channel,
    clientId: 'client-1',
  } as never
}

function makeWebhookRequest() {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: '{}',
    headers: { 'stripe-signature': 'sig_test' },
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_platform')
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', '')

  mocks.assertCompanyWritable.mockImplementation(
    async (companyId?: string | null) =>
      companyId === DEMO_COMPANY_ID ? { error: READONLY_MESSAGE } : null,
  )
  mocks.getActiveCompanyId.mockResolvedValue(NORMAL_COMPANY_ID)
  mocks.createServiceClient.mockReturnValue(makeServiceClient())
  mocks.requireServiceClient.mockReturnValue(makeServiceClient())
  mocks.createEstimate.mockResolvedValue({ jobId: 'job-1' })
  mocks.createProject.mockResolvedValue({ ok: true, projectId: 'project-1' })
  mocks.createPriceBookService.mockResolvedValue({
    ok: true,
    serviceId: 'service-1',
  })
  mocks.addCompanyKnowledge.mockResolvedValue({
    ok: true,
    knowledgeId: 'knowledge-1',
  })
  mocks.listServices.mockResolvedValue([{ id: 'service-1' }])
  mocks.sendCustomerEmail.mockResolvedValue({ ok: true, id: 'email-1' })
  mocks.sendCustomerSms.mockResolvedValue({ ok: true, sid: 'sms-1' })
  mocks.logCustomerMessage.mockResolvedValue(undefined)
  mocks.resolveChannels.mockResolvedValue({
    inApp: false,
    email: true,
    whatsapp: false,
    sms: false,
  })
  mocks.resolveOwnerPhone.mockResolvedValue(null)
  mocks.getApprovedTemplateForEvent.mockResolvedValue(null)
  mocks.inngestSend.mockResolvedValue({ ids: ['event-1'] })
  mocks.getStripeClient.mockResolvedValue({
    webhooks: { constructEvent: mocks.constructEvent },
    subscriptions: {
      retrieve: mocks.subscriptionsRetrieve,
      cancel: mocks.subscriptionsCancel,
    },
    setupIntents: { retrieve: mocks.setupIntentRetrieve },
    customers: { update: mocks.customersUpdate },
  })
  mocks.resolveConnectEventCompanyId.mockResolvedValue(null)
  mocks.handleConnectEvent.mockResolvedValue(undefined)
  mocks.grantCredits.mockResolvedValue(undefined)
  mocks.monthGrantKey.mockReturnValue('grant:key')
  mocks.getBillingConfig.mockResolvedValue({ tiers: {} })
  mocks.resolveTierFromPriceId.mockResolvedValue(null)
  mocks.notifyOps.mockResolvedValue(undefined)
})

describe('SAFE-02: shared service funnels deny trusted demo companies', () => {
  it('blocks chat persistence before constructing a service-role client', async () => {
    mocks.getActiveCompanyId.mockResolvedValue(DEMO_COMPANY_ID)

    await expect(createConversation('demo-user', 'Blocked')).resolves.toBeNull()

    expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(DEMO_COMPANY_ID)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it('keeps chat history reads available for the demo company', async () => {
    mocks.getActiveCompanyId.mockResolvedValue(DEMO_COMPANY_ID)
    const svc = makeServiceClient({ data: [], error: null })
    mocks.createServiceClient.mockReturnValue(svc)

    await expect(listConversations('demo-user')).resolves.toEqual([])

    expect(mocks.assertCompanyWritable).not.toHaveBeenCalled()
    expect(svc.from).toHaveBeenCalledWith('chat_conversations')
  })

  it('blocks every chat write tool by trusted company before neutral tool effects', async () => {
    const tools = buildChatTools({
      companyId: DEMO_COMPANY_ID,
      supabase: makeServiceClient(),
      industries: ['construction'],
    })

    const attempts = [
      execTool(tools.createEstimate, { projectId: 'project-1' }),
      execTool(tools.createProject, { name: 'Demo project' }),
      execTool(tools.addService, { name: 'Demo service', unitPrice: 100 }),
      execTool(tools.addKnowledge, {
        title: 'Demo note',
        body: 'Must not persist.',
      }),
    ]
    const results = await Promise.all(attempts)

    for (const result of results) {
      expect(result).toMatchObject({ ok: false })
      expect(JSON.stringify(result)).toMatch(/read-only demo/i)
    }
    expect(mocks.assertCompanyWritable).toHaveBeenCalledTimes(4)
    expect(mocks.createEstimate).not.toHaveBeenCalled()
    expect(mocks.createProject).not.toHaveBeenCalled()
    expect(mocks.createPriceBookService).not.toHaveBeenCalled()
    expect(mocks.addCompanyKnowledge).not.toHaveBeenCalled()
  })

  it('keeps chat read tools available for the demo company', async () => {
    const tools = buildChatTools({
      companyId: DEMO_COMPANY_ID,
      supabase: makeServiceClient(),
      industries: ['construction'],
    })

    await expect(execTool(tools.listServices, {})).resolves.toEqual([
      { id: 'service-1' },
    ])
    expect(mocks.listServices).toHaveBeenCalledWith(
      DEMO_COMPANY_ID,
      expect.anything(),
    )
    expect(mocks.assertCompanyWritable).not.toHaveBeenCalled()
  })

  it('blocks customer sends before service-role lookup, provider, or audit effects', async () => {
    const result = await sendCustomerMessage({
      permit: makePermit(),
      companyId: DEMO_COMPANY_ID,
      clientId: 'client-1',
      businessName: 'Demo Co',
      triggerSource: 'manual',
      freeform: { body: 'Must not send.' },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/read-only demo/i)
    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
    expect(mocks.sendCustomerEmail).not.toHaveBeenCalled()
    expect(mocks.sendCustomerSms).not.toHaveBeenCalled()
    expect(mocks.logCustomerMessage).not.toHaveBeenCalled()
  })

  it('preserves a normal customer email send', async () => {
    mocks.requireServiceClient.mockReturnValue(
      makeServiceClient({
        data: {
          email: 'client@example.com',
          phone: null,
          name: 'Client',
        },
        error: null,
      }),
    )

    const result = await sendCustomerMessage({
      permit: makePermit(),
      companyId: NORMAL_COMPANY_ID,
      clientId: 'client-1',
      businessName: 'Normal Co',
      triggerSource: 'manual',
      freeform: { subject: 'Hello', body: '<p>Estimate ready.</p>' },
    })

    expect(result).toMatchObject({
      ok: true,
      channel: 'email',
      providerMessageId: 'email-1',
    })
    expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
      NORMAL_COMPANY_ID,
    )
    expect(mocks.sendCustomerEmail).toHaveBeenCalledOnce()
    expect(mocks.logCustomerMessage).toHaveBeenCalledOnce()
  })

  it('blocks notification fan-out before preferences, persistence, or queues', async () => {
    const result = await notify({
      companyId: DEMO_COMPANY_ID,
      userId: 'demo-user',
      eventType: 'estimate.viewed',
      title: 'Blocked',
      body: 'Must not dispatch.',
    })

    expect(result).toEqual({ ok: false })
    expect(mocks.resolveChannels).not.toHaveBeenCalled()
    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
    expect(mocks.inngestSend).not.toHaveBeenCalled()
  })

  it('preserves normal notification queueing', async () => {
    const result = await notify({
      companyId: NORMAL_COMPANY_ID,
      userId: 'normal-user',
      eventType: 'estimate.viewed',
      title: 'Estimate sent',
      body: 'Delivery complete.',
      channels: { inApp: false, email: true },
    })

    expect(result).toEqual({ ok: true, notificationId: undefined })
    expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
      NORMAL_COMPANY_ID,
    )
    expect(mocks.inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'notification/email.queued' }),
    )
  })

  it('blocks Xphere enqueue before the queue effect', async () => {
    dispatchXphereSync(DEMO_COMPANY_ID, 'subscription.updated')

    await vi.waitFor(() =>
      expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
        DEMO_COMPANY_ID,
      ),
    )
    expect(mocks.inngestSend).not.toHaveBeenCalled()
  })

  it('preserves normal Xphere enqueueing', async () => {
    dispatchXphereSync(NORMAL_COMPANY_ID, 'subscription.updated')

    await vi.waitFor(() =>
      expect(mocks.inngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: NORMAL_COMPANY_ID }),
        }),
      ),
    )
  })
})

describe('SAFE-02: signed Stripe webhook authority order', () => {
  it('keeps signature verification before company guard, idempotency, and downstream dispatch in source order', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/webhooks/stripe/route.ts'),
      'utf8',
    )

    const signature = source.indexOf('stripe.webhooks.constructEvent(')
    const companyGuard = source.indexOf(
      'assertCompanyWritable(resolvedCompanyId)',
    )
    const idempotency = source.indexOf(".from('processed_stripe_events')")
    const connectDispatch = source.indexOf('handleConnectEvent(event')

    expect(signature).toBeGreaterThan(-1)
    expect(companyGuard).toBeGreaterThan(signature)
    expect(companyGuard).toBeLessThan(idempotency)
    expect(signature).toBeLessThan(idempotency)
    expect(signature).toBeLessThan(connectDispatch)
  })

  it('rejects invalid signatures before company resolution or effects', async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error('invalid signature')
    })

    const response = await stripeWebhook(makeWebhookRequest())

    expect(response.status).toBe(400)
    expect(mocks.assertCompanyWritable).not.toHaveBeenCalled()
    expect(mocks.resolveConnectEventCompanyId).not.toHaveBeenCalled()
    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
    expect(mocks.handleConnectEvent).not.toHaveBeenCalled()
    expect(mocks.grantCredits).not.toHaveBeenCalled()
    expect(mocks.inngestSend).not.toHaveBeenCalled()
  })

  it('preserves signed normal event idempotency behavior', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_normal',
      type: 'unknown.event',
      data: { object: {} },
    })
    const dedupQuery = makeQuery()
    const svc = { from: vi.fn(() => dedupQuery) }
    mocks.requireServiceClient.mockReturnValue(svc)

    const response = await stripeWebhook(makeWebhookRequest())

    expect(response.status).toBe(200)
    expect(mocks.constructEvent).toHaveBeenCalledOnce()
    expect(svc.from).toHaveBeenCalledWith('processed_stripe_events')
    expect(
      mocks.constructEvent.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.requireServiceClient.mock.invocationCallOrder[0]!)
  })

  const metadataEvents = [
    {
      name: 'subscription checkout',
      event: {
        id: 'evt_demo_subscription',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_demo_subscription',
            mode: 'subscription',
            customer: 'cus_demo',
            subscription: 'sub_demo',
            metadata: { companyId: DEMO_COMPANY_ID, plan: 'pro' },
          },
        },
      },
    },
    {
      name: 'credit top-up',
      event: {
        id: 'evt_demo_topup',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_demo_topup',
            mode: 'payment',
            payment_status: 'paid',
            metadata: {
              type: 'credit_topup',
              companyId: DEMO_COMPANY_ID,
              credits: '100',
            },
          },
        },
      },
    },
    {
      name: 'auto-top-up setup',
      event: {
        id: 'evt_demo_setup',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_demo_setup',
            mode: 'setup',
            customer: 'cus_demo',
            setup_intent: 'seti_demo',
            metadata: {
              type: 'autotopup_setup',
              companyId: DEMO_COMPANY_ID,
            },
          },
        },
      },
    },
    {
      name: 'automatic top-up charge',
      event: {
        id: 'evt_demo_auto_topup',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_demo',
            metadata: {
              type: 'auto_topup',
              companyId: DEMO_COMPANY_ID,
              credits: '100',
            },
          },
        },
      },
    },
  ]

  for (const metadataCase of metadataEvents) {
    it(`denies a verified demo-company ${metadataCase.name} before idempotency or effects`, async () => {
      mocks.constructEvent.mockReturnValue(metadataCase.event)
      const svc = { from: vi.fn(() => makeQuery()) }
      mocks.requireServiceClient.mockReturnValue(svc)

      const response = await stripeWebhook(makeWebhookRequest())

      expect(response.status).toBe(200)
      expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
        DEMO_COMPANY_ID,
      )
      expect(
        mocks.constructEvent.mock.invocationCallOrder[0],
      ).toBeLessThan(mocks.assertCompanyWritable.mock.invocationCallOrder[0]!)
      expect(svc.from).not.toHaveBeenCalled()
      expect(mocks.grantCredits).not.toHaveBeenCalled()
      expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled()
      expect(mocks.subscriptionsCancel).not.toHaveBeenCalled()
      expect(mocks.setupIntentRetrieve).not.toHaveBeenCalled()
      expect(mocks.customersUpdate).not.toHaveBeenCalled()
      expect(mocks.notifyOps).not.toHaveBeenCalled()
      expect(mocks.inngestSend).not.toHaveBeenCalled()
    })
  }

  it('resolves a subscription mapping after signature verification and denies before writes or dispatch', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_demo_subscription_update',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_demo',
          items: { data: [] },
          cancel_at_period_end: false,
        },
      },
    })
    const resolutionQuery = makeQuery({
      data: { id: DEMO_COMPANY_ID },
      error: null,
    })
    const svc = {
      from: vi.fn((table: string) => {
        if (table !== 'companies') {
          throw new Error(`unexpected effect table: ${table}`)
        }
        return resolutionQuery
      }),
    }
    mocks.requireServiceClient.mockReturnValue(svc)

    const response = await stripeWebhook(makeWebhookRequest())

    expect(response.status).toBe(200)
    expect(svc.from).toHaveBeenCalledOnce()
    expect(svc.from).toHaveBeenCalledWith('companies')
    expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
      DEMO_COMPANY_ID,
    )
    expect(mocks.resolveTierFromPriceId).not.toHaveBeenCalled()
    expect(mocks.inngestSend).not.toHaveBeenCalled()
  })

  for (const connectType of [
    'checkout.session.completed',
    'invoice.paid',
  ]) {
    it(`denies a verified demo-company Connect ${connectType} before idempotency or handler dispatch`, async () => {
      const event = {
        id: `evt_demo_connect_${connectType}`,
        type: connectType,
        account: 'acct_demo',
        data: {
          object:
            connectType === 'invoice.paid'
              ? {
                  metadata: {
                    invoice_id: 'invoice-demo',
                    company_id: DEMO_COMPANY_ID,
                  },
                }
              : {
                  metadata: {
                    estimate_id: 'estimate-demo',
                    company_id: DEMO_COMPANY_ID,
                  },
                },
        },
      }
      mocks.constructEvent.mockReturnValue(event)
      mocks.resolveConnectEventCompanyId.mockResolvedValue(DEMO_COMPANY_ID)
      const svc = { from: vi.fn(() => makeQuery()) }
      mocks.requireServiceClient.mockReturnValue(svc)

      const response = await stripeWebhook(makeWebhookRequest())

      expect(response.status).toBe(200)
      expect(mocks.resolveConnectEventCompanyId).toHaveBeenCalledWith(
        event,
        svc,
      )
      expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
        DEMO_COMPANY_ID,
      )
      expect(svc.from).not.toHaveBeenCalled()
      expect(mocks.handleConnectEvent).not.toHaveBeenCalled()
    })
  }

  it('passes the already guarded normal company into Connect handling', async () => {
    const event = {
      id: 'evt_normal_connect',
      type: 'invoice.paid',
      account: 'acct_normal',
      data: {
        object: {
          metadata: {
            invoice_id: 'invoice-normal',
            company_id: NORMAL_COMPANY_ID,
          },
        },
      },
    }
    mocks.constructEvent.mockReturnValue(event)
    mocks.resolveConnectEventCompanyId.mockResolvedValue(NORMAL_COMPANY_ID)
    const dedupQuery = makeQuery()
    const svc = { from: vi.fn(() => dedupQuery) }
    mocks.requireServiceClient.mockReturnValue(svc)

    const response = await stripeWebhook(makeWebhookRequest())

    expect(response.status).toBe(200)
    expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
      NORMAL_COMPANY_ID,
    )
    expect(mocks.handleConnectEvent).toHaveBeenCalledWith(
      event,
      expect.anything(),
      svc,
      NORMAL_COMPANY_ID,
    )
  })

  it('requires Connect direct callers to guard a trusted or independently resolved company before event writes', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/billing/connect-webhook.ts'),
      'utf8',
    )
    const handlerStart = source.indexOf(
      'export async function handleConnectEvent(',
    )
    const handler = source.slice(handlerStart)
    const resolution = handler.indexOf('resolveConnectEventCompanyId(')
    const guard = handler.indexOf('assertCompanyWritable(companyId)')
    const failClosed = handler.indexOf(
      '!companyId && connectEventRequiresCompanyResolution(event)',
    )
    const dispatch = handler.indexOf('switch (event.type)')

    expect(handlerStart).toBeGreaterThan(-1)
    expect(resolution).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(resolution)
    expect(failClosed).toBeGreaterThan(guard)
    expect(dispatch).toBeGreaterThan(failClosed)
  })
})
