import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createFunction: vi.fn<(config: unknown, handler: unknown) => void>(),
  inngestSend: vi.fn(),
  requireServiceClient: vi.fn(),
  assertCompanyWritable: vi.fn(),
  assertSendAllowed: vi.fn(),
  sendCustomerMessage: vi.fn(),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: mocks.inngestSend, createFunction: mocks.createFunction },
}))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: mocks.requireServiceClient }))
vi.mock('@/lib/demo/guard', () => ({ assertCompanyWritable: mocks.assertCompanyWritable }))
vi.mock('@/lib/notifications/customer-send-gate', () => ({ assertSendAllowed: mocks.assertSendAllowed }))
vi.mock('@/lib/notifications/customer-send', () => ({ sendCustomerMessage: mocks.sendCustomerMessage }))
vi.mock('@/lib/utils/site-url', () => ({ getCanonicalBaseUrl: () => 'https://xtimator.test' }))

import {
  deliverSignatureReceipt,
  enqueueSignatureReceipt,
  EVENT_SIGNATURE_RECEIPT_QUEUED,
  listDueSignatureReceipts,
} from '@/lib/estimate/signature-receipt'
import '@/lib/inngest/functions/signature-receipt'

const [jobConfig] = mocks.createFunction.mock.calls[0]
const id = 'receipt-1'
const scope = { kind: 'estimate', documentId: 'document-1', companyId: 'company-1' } as const
const permit = { clientId: 'client-1', channel: 'email' }
const shareToken = 'test-share-token'
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const receipt = {
  id,
  kind: scope.kind,
  document_id: scope.documentId,
  company_id: scope.companyId,
  client_id: permit.clientId,
  recipient_sha256: sha256('client@example.com'),
  share_token_sha256: sha256(shareToken),
  business_name: 'Bright Plumbing',
  language: 'en',
  attempts: 0,
  created_at: '2026-11-23T23:58:00Z',
}
const document = { project_id: 'project-1', share_token: shareToken, share_expires_at: null }

function query(data: unknown) {
  const response = { data, error: null }
  return {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(Promise.resolve(response)),
    maybeSingle: vi.fn().mockResolvedValue(response),
  }
}

function fixture() {
  const reads = query(receipt)
  const claim = query({ id })
  const writes = query(null)
  const documentLookup = query(document)
  const projectLookup = query({ id: 'project-1' })
  const from = vi.fn()
    .mockReturnValueOnce(reads)
    .mockReturnValueOnce(claim)
    .mockReturnValueOnce(documentLookup)
    .mockReturnValueOnce(projectLookup)
    .mockReturnValue(writes)
  mocks.requireServiceClient.mockReturnValue({ from })
  return { reads, claim, writes, documentLookup, projectLookup, from }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-24T00:00:00Z'))
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('DATA_API_MODE', 'postgrest')
  mocks.assertCompanyWritable.mockResolvedValue(null)
  mocks.assertSendAllowed.mockResolvedValue({ allowed: true, permit })
  mocks.sendCustomerMessage.mockResolvedValue({ ok: true, providerMessageId: 'resend-message-1' })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('signature receipt outbox', () => {
  it('registers both event and scheduled recovery for receipt delivery', () => {
    expect(jobConfig).toMatchObject({
      id: 'signature-receipt-outbox',
      triggers: [{ event: EVENT_SIGNATURE_RECEIPT_QUEUED }, { cron: '*/2 * * * *' }],
    })
  })

  it('publishes a repeatable wake-up event containing only document identifiers', async () => {
    await enqueueSignatureReceipt(scope)
    await enqueueSignatureReceipt(scope)

    const event = {
      id: 'signature-receipt:estimate:document-1',
      name: EVENT_SIGNATURE_RECEIPT_QUEUED,
      data: scope,
    }
    expect(mocks.inngestSend).toHaveBeenNthCalledWith(1, event)
    expect(mocks.inngestSend).toHaveBeenNthCalledWith(2, event)
  })

  it('sweeps due outbox rows without the wake-up event', async () => {
    const sweep = query([{ id }])
    const from = vi.fn().mockReturnValue(sweep)
    mocks.requireServiceClient.mockReturnValue({ from })

    expect(await listDueSignatureReceipts()).toEqual([id])
    expect(from).toHaveBeenCalledWith('signature_receipt_outbox')
    expect(sweep.eq).toHaveBeenCalledWith('state', 'pending')
    expect(sweep.lte).toHaveBeenCalledWith('available_at', '2026-11-24T00:00:00.000Z')
  })

  it('suppresses both the worker and its wake-up in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    await enqueueSignatureReceipt(scope)
    expect(await deliverSignatureReceipt(id)).toBe('skipped')
    expect(mocks.inngestSend).not.toHaveBeenCalled()
    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
    expect(mocks.sendCustomerMessage).not.toHaveBeenCalled()
  })

  it('also disables delivery in a local production build using the development database', async () => {
    vi.stubEnv('DATA_API_MODE', 'supabase')

    await enqueueSignatureReceipt(scope)
    expect(await deliverSignatureReceipt(id)).toBe('skipped')
    expect(mocks.inngestSend).not.toHaveBeenCalled()
    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
  })

  it('leaves a receipt to the worker that won the claim', async () => {
    const { claim, from } = fixture()
    claim.maybeSingle.mockResolvedValue({ data: null, error: null })

    expect(await deliverSignatureReceipt(id)).toBe('busy')
    expect(claim.eq).toHaveBeenCalledWith('attempts', 0)
    expect(claim.lte).toHaveBeenCalledWith('available_at', '2026-11-24T00:00:00.000Z')
    expect(from).toHaveBeenCalledTimes(2)
    expect(mocks.sendCustomerMessage).not.toHaveBeenCalled()
  })

  it('uses the protected share page, sender identity, and stable send key', async () => {
    const { writes, documentLookup, projectLookup } = fixture()

    expect(await deliverSignatureReceipt(id)).toBe('sent')
    expect(documentLookup.eq).toHaveBeenCalledWith('client_response', 'accepted')
    expect(documentLookup.eq).toHaveBeenCalledWith('company_id', scope.companyId)
    expect(projectLookup.eq).toHaveBeenCalledWith('client_id', permit.clientId)
    expect(mocks.assertSendAllowed).toHaveBeenCalledWith(scope.companyId, permit.clientId, 'email')
    expect(mocks.sendCustomerMessage).toHaveBeenCalledWith(expect.objectContaining({
      permit,
      companyId: scope.companyId,
      clientId: permit.clientId,
      triggerSource: 'signature-receipt',
      freeform: expect.objectContaining({ body: expect.stringContaining(`https://xtimator.test/estimate/${shareToken}`) }),
      emailDelivery: { recipientSha256: receipt.recipient_sha256, idempotencyKey: 'signature-receipt/receipt-1' },
    }))
    expect(writes.update).toHaveBeenCalledWith(expect.objectContaining({
      state: 'sent',
      provider_message_id: 'resend-message-1',
      recipient_sha256: null,
      share_token_sha256: null,
    }))
  })

  it('skips a rotated link before checking consent or sending', async () => {
    const { documentLookup, from, writes } = fixture()
    documentLookup.maybeSingle.mockResolvedValue({ data: { ...document, share_token: 'rotated-token' } })
    from.mockReset()
      .mockReturnValueOnce(query(receipt))
      .mockReturnValueOnce(query({ id }))
      .mockReturnValueOnce(documentLookup)
      .mockReturnValue(writes)

    expect(await deliverSignatureReceipt(id)).toBe('skipped')
    expect(mocks.assertSendAllowed).not.toHaveBeenCalled()
    expect(mocks.sendCustomerMessage).not.toHaveBeenCalled()
    expect(writes.update).toHaveBeenCalledWith(expect.objectContaining({ state: 'skipped' }))
  })

  it('defers a failed send and reuses the same provider key on the next attempt', async () => {
    const first = fixture()
    mocks.sendCustomerMessage.mockResolvedValueOnce({ ok: false, error: 'network_error' })

    expect(await deliverSignatureReceipt(id)).toBe('deferred')
    expect(first.writes.update).toHaveBeenCalledWith({
      available_at: '2026-11-24T00:02:00.000Z',
      last_issue: 'email_delivery_failed',
    })

    vi.setSystemTime(new Date('2026-11-24T00:02:01Z'))
    const second = fixture()
    second.reads.maybeSingle.mockResolvedValue({ data: { ...receipt, attempts: 1 }, error: null })
    expect(await deliverSignatureReceipt(id)).toBe('sent')
    expect(mocks.sendCustomerMessage.mock.calls[0][0].emailDelivery.idempotencyKey).toBe(
      mocks.sendCustomerMessage.mock.calls[1][0].emailDelivery.idempotencyKey,
    )
  })
})
