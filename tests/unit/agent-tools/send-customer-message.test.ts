import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 178 Plan 02 (AGENT-01/02/03) — the neutral draft/confirm/cancel
 * capability both channel adapters (WhatsApp 178-03, MCP 178-04) bind to.
 * Mocks the four boundary modules at their module paths; a hand-built
 * `supabase` mock is passed directly as the function argument (this module
 * never creates its own client).
 *
 * CLAIM-BEFORE-DISPATCH (Wave-2 ADOPTED order, supersedes the plan's
 * literal "gate -> dispatch -> markConfirmed(always)" text): finalize
 * calls markConfirmed() FIRST as an atomic claim. A failed claim (another
 * caller already resolved the row) short-circuits to 'already_processed'
 * with NO integrity check, NO gate call, and NO dispatch.
 */

vi.mock('@/lib/notifications/agentic-send-confirm', () => ({
  createSendConfirmation: vi.fn(),
  resolvePendingByChannelRef: vi.fn(),
  resolveByToken: vi.fn(),
  markConfirmed: vi.fn(),
  markCancelled: vi.fn(),
  markRefused: vi.fn(),
  verifyBinding: vi.fn(),
  checkAgenticSendRateLimit: vi.fn(),
}))

vi.mock('@/lib/notifications/customer-send-gate', () => ({
  assertSendAllowed: vi.fn(),
}))

vi.mock('@/lib/notifications/customer-send', () => ({
  sendCustomerMessage: vi.fn(),
}))

import {
  draftCustomerMessage,
  confirmSendByChannelRef,
  confirmSendByToken,
  cancelSendByChannelRef,
  type DraftSendParams,
} from '@/lib/agent-tools/send-customer-message'
import {
  createSendConfirmation,
  resolvePendingByChannelRef,
  resolveByToken,
  markConfirmed,
  markCancelled,
  markRefused,
  verifyBinding,
  checkAgenticSendRateLimit,
  type PendingSendConfirmation,
} from '@/lib/notifications/agentic-send-confirm'
import { assertSendAllowed } from '@/lib/notifications/customer-send-gate'
import { sendCustomerMessage } from '@/lib/notifications/customer-send'

const mockCreateSendConfirmation = vi.mocked(createSendConfirmation)
const mockResolvePendingByChannelRef = vi.mocked(resolvePendingByChannelRef)
const mockResolveByToken = vi.mocked(resolveByToken)
const mockMarkConfirmed = vi.mocked(markConfirmed)
const mockMarkCancelled = vi.mocked(markCancelled)
const mockMarkRefused = vi.mocked(markRefused)
const mockVerifyBinding = vi.mocked(verifyBinding)
const mockCheckAgenticSendRateLimit = vi.mocked(checkAgenticSendRateLimit)
const mockAssertSendAllowed = vi.mocked(assertSendAllowed)
const mockSendCustomerMessage = vi.mocked(sendCustomerMessage)

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckAgenticSendRateLimit.mockResolvedValue(true)
})

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> | null

/** `.select().eq().ilike().limit()`-shaped mock for `clients`. */
function makeClientsQuery(rows: Row[]) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null })
  const ilike = vi.fn().mockReturnValue({ limit })
  const eq = vi.fn().mockReturnValue({ ilike })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, ilike, limit }
}

/** `.select().eq().maybeSingle()`-shaped mock for `companies`. */
function makeCompaniesQuery(row: Row) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, maybeSingle }
}

function makeSupabase(opts: { clientsRows?: Row[]; companyRow?: Row } = {}) {
  const clientsQuery = makeClientsQuery(opts.clientsRows ?? [])
  const companiesQuery = makeCompaniesQuery(opts.companyRow ?? { name: "Joe's Plumbing" })
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'clients') return clientsQuery
    if (table === 'companies') return companiesQuery
    throw new Error(`unexpected table: ${table}`)
  })
  const client = { from } as unknown as SupabaseClient
  return { client, from, clientsQuery, companiesQuery }
}

const CLIENT_ROW = {
  id: 'client-1',
  name: 'Jane Client',
  phone: '+15551234567',
  email: 'jane@example.com',
}

const BASE_DRAFT_PARAMS: DraftSendParams = {
  companyId: 'company-1',
  clientQuery: 'Jane',
  channel: 'sms',
  body: 'Your estimate is ready.',
  triggerSource: 'agentic-whatsapp',
  channelRef: '+15559998888',
}

function makePending(overrides: Partial<PendingSendConfirmation> = {}): PendingSendConfirmation {
  return {
    id: 'confirmation-1',
    companyId: 'company-1',
    clientId: 'client-1',
    channel: 'sms',
    subject: null,
    body: 'Your estimate is ready.',
    bodyHash: 'hash-1',
    triggerSource: 'agentic-whatsapp',
    channelRef: '+15559998888',
    token: null,
    status: 'pending',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// draftCustomerMessage
// ---------------------------------------------------------------------------

describe('draftCustomerMessage', () => {
  it('rate limit denies -> rate_limited; no clients query attempted, createSendConfirmation not called', async () => {
    mockCheckAgenticSendRateLimit.mockResolvedValue(false)
    const { client, from } = makeSupabase()

    const result = await draftCustomerMessage(client, BASE_DRAFT_PARAMS)

    expect(result).toEqual({ ok: false, error: 'rate_limited' })
    expect(from).not.toHaveBeenCalledWith('clients')
    expect(mockCreateSendConfirmation).not.toHaveBeenCalled()
  })

  it('0 client matches -> client_not_found', async () => {
    const { client } = makeSupabase({ clientsRows: [] })
    const result = await draftCustomerMessage(client, BASE_DRAFT_PARAMS)
    expect(result).toEqual({ ok: false, error: 'client_not_found' })
  })

  it('2 client matches -> client_ambiguous with candidate names; createSendConfirmation not called', async () => {
    const { client } = makeSupabase({
      clientsRows: [
        { id: 'c1', name: 'Jane A', phone: '+1', email: 'a@x.com' },
        { id: 'c2', name: 'Jane B', phone: '+2', email: 'b@x.com' },
      ],
    })

    const result = await draftCustomerMessage(client, BASE_DRAFT_PARAMS)

    expect(result).toEqual({
      ok: false,
      error: 'client_ambiguous',
      candidates: ['Jane A', 'Jane B'],
    })
    expect(mockCreateSendConfirmation).not.toHaveBeenCalled()
  })

  it('1 match, channel email, client.email null -> no_recipient_email', async () => {
    const { client } = makeSupabase({ clientsRows: [{ ...CLIENT_ROW, email: null }] })

    const result = await draftCustomerMessage(client, {
      ...BASE_DRAFT_PARAMS,
      channel: 'email',
    })

    expect(result).toEqual({ ok: false, error: 'no_recipient_email' })
  })

  it('1 match, channel sms, client.phone null -> no_recipient_phone', async () => {
    const { client } = makeSupabase({ clientsRows: [{ ...CLIENT_ROW, phone: null }] })

    const result = await draftCustomerMessage(client, { ...BASE_DRAFT_PARAMS, channel: 'sms' })

    expect(result).toEqual({ ok: false, error: 'no_recipient_phone' })
  })

  it('1 match, email channel, recipient present -> createSendConfirmation called with resolved clientId + exact fields; preview recipient = email, body NOT prefixed', async () => {
    const { client } = makeSupabase({ clientsRows: [CLIENT_ROW] })
    mockCreateSendConfirmation.mockResolvedValue({
      id: 'confirmation-1',
      token: null,
      expiresAt: '2026-07-22T00:00:00.000Z',
    })

    const result = await draftCustomerMessage(client, {
      ...BASE_DRAFT_PARAMS,
      channel: 'email',
      body: 'Your estimate is ready.',
      subject: 'Estimate',
      channelRef: null,
    })

    expect(mockCreateSendConfirmation).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        companyId: 'company-1',
        clientId: 'client-1',
        channel: 'email',
        body: 'Your estimate is ready.',
        subject: 'Estimate',
        triggerSource: 'agentic-whatsapp',
        channelRef: null,
      }),
    )
    // Not a name/phone/email string.
    const insertArg = mockCreateSendConfirmation.mock.calls[0]![1]
    expect(insertArg.clientId).toBe('client-1')

    expect(result).toEqual({
      ok: true,
      confirmationId: 'confirmation-1',
      token: null,
      clientId: 'client-1',
      clientName: 'Jane Client',
      recipient: 'jane@example.com',
      channel: 'email',
      body: 'Your estimate is ready.',
      subject: 'Estimate',
    })
  })

  it('1 match, sms channel, recipient present -> createSendConfirmation called with the RAW (un-prefixed) body; preview recipient = phone, preview body IS business-name-prefixed', async () => {
    const { client, companiesQuery } = makeSupabase({
      clientsRows: [CLIENT_ROW],
      companyRow: { name: "Joe's Plumbing" },
    })
    mockCreateSendConfirmation.mockResolvedValue({
      id: 'confirmation-2',
      token: null,
      expiresAt: '2026-07-22T00:00:00.000Z',
    })

    const result = await draftCustomerMessage(client, {
      ...BASE_DRAFT_PARAMS,
      channel: 'sms',
      body: 'Your estimate is ready.',
    })

    // Stored body stays raw/pre-prefix — dispatch applies the prefix once,
    // at send time, so storing it pre-prefixed here would double it.
    expect(mockCreateSendConfirmation).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ body: 'Your estimate is ready.' }),
    )
    expect(companiesQuery.select).toHaveBeenCalled()
    // Preview mirrors the SMS business-name prefix byte-for-byte, matching
    // what sendCustomerMessage() will actually deliver.
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        recipient: '+15551234567',
        body: "Joe's Plumbing: Your estimate is ready.",
      }),
    )
  })

  it('sms preview falls back to the default business name when the company has no name on file', async () => {
    const { client } = makeSupabase({ clientsRows: [CLIENT_ROW], companyRow: { name: null } })
    mockCreateSendConfirmation.mockResolvedValue({
      id: 'confirmation-3',
      token: null,
      expiresAt: '2026-07-22T00:00:00.000Z',
    })

    const result = await draftCustomerMessage(client, { ...BASE_DRAFT_PARAMS, channel: 'sms' })

    expect(result).toEqual(
      expect.objectContaining({ body: 'Your contractor: Your estimate is ready.' }),
    )
  })

  it('the clients query is scoped by .eq("company_id", companyId) — cross-tenant lookup is structurally impossible', async () => {
    const { client, clientsQuery } = makeSupabase({ clientsRows: [CLIENT_ROW] })
    mockCreateSendConfirmation.mockResolvedValue({
      id: 'confirmation-4',
      token: null,
      expiresAt: '2026-07-22T00:00:00.000Z',
    })

    await draftCustomerMessage(client, { ...BASE_DRAFT_PARAMS, channel: 'email' })

    expect(clientsQuery.eq).toHaveBeenCalledWith('company_id', 'company-1')
  })
})

// ---------------------------------------------------------------------------
// confirmSendByChannelRef / confirmSendByToken (shared finalizeConfirmedSend)
// ---------------------------------------------------------------------------

describe('confirmSendByChannelRef / confirmSendByToken — finalizeConfirmedSend', () => {
  it('confirmSendByChannelRef: no pending row resolved -> not_found; assertSendAllowed NOT called', async () => {
    mockResolvePendingByChannelRef.mockResolvedValue(null)
    const { client } = makeSupabase()

    const result = await confirmSendByChannelRef(client, 'company-1', '+15559998888')

    expect(result).toEqual({ ok: false, error: 'not_found' })
    expect(mockAssertSendAllowed).not.toHaveBeenCalled()
    expect(mockMarkConfirmed).not.toHaveBeenCalled()
  })

  it('confirmSendByToken: no pending row resolved -> not_found; assertSendAllowed NOT called', async () => {
    mockResolveByToken.mockResolvedValue(null)
    const { client } = makeSupabase()

    const result = await confirmSendByToken(client, 'company-1', 'tok-abc')

    expect(result).toEqual({ ok: false, error: 'not_found' })
    expect(mockAssertSendAllowed).not.toHaveBeenCalled()
  })

  it('CLAIM-BEFORE-DISPATCH: failed claim (markConfirmed -> false) -> already_processed; NO integrity check, NO gate call, NO dispatch', async () => {
    const pending = makePending()
    mockResolvePendingByChannelRef.mockResolvedValue(pending)
    mockMarkConfirmed.mockResolvedValue(false)
    const { client } = makeSupabase()

    const result = await confirmSendByChannelRef(client, 'company-1', '+15559998888')

    expect(result).toEqual({ ok: false, error: 'already_processed' })
    expect(mockVerifyBinding).not.toHaveBeenCalled()
    expect(mockAssertSendAllowed).not.toHaveBeenCalled()
    expect(mockSendCustomerMessage).not.toHaveBeenCalled()
  })

  it('verifyBinding returns false (tampered row) -> claim still attempted, then markRefused called; assertSendAllowed NOT called; integrity_error', async () => {
    const pending = makePending()
    mockResolvePendingByChannelRef.mockResolvedValue(pending)
    mockMarkConfirmed.mockResolvedValue(true)
    mockVerifyBinding.mockReturnValue(false)
    const { client } = makeSupabase()

    const result = await confirmSendByChannelRef(client, 'company-1', '+15559998888')

    expect(mockMarkConfirmed).toHaveBeenCalledWith(client, pending.id)
    expect(mockMarkRefused).toHaveBeenCalledWith(client, pending.id)
    expect(mockAssertSendAllowed).not.toHaveBeenCalled()
    expect(mockSendCustomerMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'integrity_error' })
  })

  it('gate denies (quiet_hours) -> markRefused called, sendCustomerMessage NOT called, result surfaces the gate reason', async () => {
    const pending = makePending()
    mockResolvePendingByChannelRef.mockResolvedValue(pending)
    mockMarkConfirmed.mockResolvedValue(true)
    mockVerifyBinding.mockReturnValue(true)
    mockAssertSendAllowed.mockResolvedValue({ allowed: false, reason: 'quiet_hours' })
    const { client } = makeSupabase()

    const result = await confirmSendByChannelRef(client, 'company-1', '+15559998888')

    expect(mockMarkRefused).toHaveBeenCalledWith(client, pending.id)
    expect(mockSendCustomerMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'quiet_hours' })
  })

  it('gate allows -> sendCustomerMessage called with the gate permit + pending subject/body/triggerSource (not re-derived); claim already happened, no second markConfirmed call', async () => {
    const pending = makePending({ subject: 'Estimate ready', body: 'Here it is.' })
    mockResolveByToken.mockResolvedValue(pending)
    mockMarkConfirmed.mockResolvedValue(true)
    mockVerifyBinding.mockReturnValue(true)
    const permit = { clientId: 'client-1', channel: 'sms', grantedAt: 'now' } as never
    mockAssertSendAllowed.mockResolvedValue({ allowed: true, permit })
    mockSendCustomerMessage.mockResolvedValue({ ok: true, channel: 'sms', providerMessageId: 'SM1' })
    const { client } = makeSupabase({ companyRow: { name: "Joe's Plumbing" } })

    const result = await confirmSendByToken(client, 'company-1', 'tok-abc')

    expect(mockSendCustomerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        permit,
        companyId: 'company-1',
        clientId: 'client-1',
        businessName: "Joe's Plumbing",
        triggerSource: 'agentic-whatsapp',
        freeform: { subject: 'Estimate ready', body: 'Here it is.' },
      }),
    )
    expect(mockMarkConfirmed).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, error: undefined })
  })

  it('dispatch fails -> the dispatch error surfaces (not a generic one); claim already committed the confirmed status, no further status write', async () => {
    const pending = makePending()
    mockResolvePendingByChannelRef.mockResolvedValue(pending)
    mockMarkConfirmed.mockResolvedValue(true)
    mockVerifyBinding.mockReturnValue(true)
    const permit = { clientId: 'client-1', channel: 'sms', grantedAt: 'now' } as never
    mockAssertSendAllowed.mockResolvedValue({ allowed: true, permit })
    mockSendCustomerMessage.mockResolvedValue({
      ok: false,
      channel: 'sms',
      error: 'no_recipient_phone',
    })
    const { client } = makeSupabase()

    const result = await confirmSendByChannelRef(client, 'company-1', '+15559998888')

    expect(result).toEqual({ ok: false, error: 'no_recipient_phone' })
    expect(mockMarkRefused).not.toHaveBeenCalled()
  })

  it('CONCURRENT double-confirm: two callers race the same pending row -> exactly one dispatch happens', async () => {
    const pending = makePending()
    mockResolvePendingByChannelRef.mockResolvedValue(pending)
    // Simulate the atomic DB claim: first caller to reach markConfirmed
    // wins (true), every subsequent caller on the same row loses (false).
    let claimed = false
    mockMarkConfirmed.mockImplementation(async () => {
      if (claimed) return false
      claimed = true
      return true
    })
    mockVerifyBinding.mockReturnValue(true)
    const permit = { clientId: 'client-1', channel: 'sms', grantedAt: 'now' } as never
    mockAssertSendAllowed.mockResolvedValue({ allowed: true, permit })
    mockSendCustomerMessage.mockResolvedValue({ ok: true, channel: 'sms', providerMessageId: 'SM1' })
    const { client } = makeSupabase()

    const [a, b] = await Promise.all([
      confirmSendByChannelRef(client, 'company-1', '+15559998888'),
      confirmSendByChannelRef(client, 'company-1', '+15559998888'),
    ])

    expect(mockSendCustomerMessage).toHaveBeenCalledTimes(1)
    const results = [a, b]
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => r.error === 'already_processed')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// cancelSendByChannelRef
// ---------------------------------------------------------------------------

describe('cancelSendByChannelRef', () => {
  it('no pending row -> { ok: false }', async () => {
    mockResolvePendingByChannelRef.mockResolvedValue(null)
    const { client } = makeSupabase()

    const result = await cancelSendByChannelRef(client, 'company-1', '+15559998888')

    expect(result).toEqual({ ok: false })
    expect(mockMarkCancelled).not.toHaveBeenCalled()
  })

  it('pending row found -> markCancelled called with its id; assertSendAllowed/sendCustomerMessage never called; { ok: true }', async () => {
    const pending = makePending()
    mockResolvePendingByChannelRef.mockResolvedValue(pending)
    const { client } = makeSupabase()

    const result = await cancelSendByChannelRef(client, 'company-1', '+15559998888')

    expect(mockMarkCancelled).toHaveBeenCalledWith(client, pending.id)
    expect(mockAssertSendAllowed).not.toHaveBeenCalled()
    expect(mockSendCustomerMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })
})
