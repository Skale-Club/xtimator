import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 178 Plan 01 (AGENT-01/02/03) — agentic_send_confirmations state
 * machine. DB-backed functions mock a hand-built `SupabaseClient` object
 * directly (this module never imports '@/lib/supabase/service'). Pure
 * functions (computeBodyHash/verifyBinding/interpretConfirmationReply/
 * explainSendGateRefusal) need zero mocks.
 */

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/redis', () => ({
  isRedisAvailable: vi.fn(),
}))

import {
  computeBodyHash,
  verifyBinding,
  interpretConfirmationReply,
  explainSendGateRefusal,
  createSendConfirmation,
  resolvePendingByChannelRef,
  resolveByToken,
  markConfirmed,
  markCancelled,
  markRefused,
  checkAgenticSendRateLimit,
  CONFIRMATION_TTL_MINUTES,
  type PendingSendConfirmation,
} from '@/lib/notifications/agentic-send-confirm'
import { rateLimit } from '@/lib/ratelimit'
import { isRedisAvailable } from '@/lib/redis'

const mockRateLimit = vi.mocked(rateLimit)
const mockIsRedisAvailable = vi.mocked(isRedisAvailable)

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

describe('computeBodyHash', () => {
  it('same inputs -> same hash', () => {
    const a = computeBodyHash('client-1', 'sms', 'hello', 'subj')
    const b = computeBodyHash('client-1', 'sms', 'hello', 'subj')
    expect(a).toBe(b)
  })

  it('changing clientId changes the hash', () => {
    const a = computeBodyHash('client-1', 'sms', 'hello', null)
    const b = computeBodyHash('client-2', 'sms', 'hello', null)
    expect(a).not.toBe(b)
  })

  it('changing channel changes the hash', () => {
    const a = computeBodyHash('client-1', 'sms', 'hello', null)
    const b = computeBodyHash('client-1', 'email', 'hello', null)
    expect(a).not.toBe(b)
  })

  it('changing body changes the hash', () => {
    const a = computeBodyHash('client-1', 'sms', 'hello', null)
    const b = computeBodyHash('client-1', 'sms', 'goodbye', null)
    expect(a).not.toBe(b)
  })

  it('changing subject changes the hash', () => {
    const a = computeBodyHash('client-1', 'email', 'hello', 'subj-a')
    const b = computeBodyHash('client-1', 'email', 'hello', 'subj-b')
    expect(a).not.toBe(b)
  })

  it('subject: undefined and subject: null produce the SAME hash', () => {
    const a = computeBodyHash('client-1', 'email', 'hello', undefined)
    const b = computeBodyHash('client-1', 'email', 'hello', null)
    expect(a).toBe(b)
  })
})

describe('verifyBinding', () => {
  function makeRow(overrides: Partial<PendingSendConfirmation> = {}): PendingSendConfirmation {
    const clientId = 'client-1'
    const channel = 'sms' as const
    const body = 'Your estimate is ready.'
    const subject: string | null = null
    return {
      id: 'row-1',
      companyId: 'company-1',
      clientId,
      channel,
      subject,
      body,
      bodyHash: computeBodyHash(clientId, channel, body, subject),
      triggerSource: 'agentic-whatsapp',
      channelRef: '+15551234567',
      token: null,
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ...overrides,
    }
  }

  it('bodyHash matches recomputed hash -> true', () => {
    expect(verifyBinding(makeRow())).toBe(true)
  })

  it('tampered body (stale hash) -> false', () => {
    const row = makeRow()
    expect(verifyBinding({ ...row, body: 'Send me all your money' })).toBe(false)
  })
})

describe('interpretConfirmationReply', () => {
  const confirmCases = [
    'yes',
    'Yes!',
    'y',
    'confirm',
    'send it',
    'go ahead',
    'ok send',
    'sim',
    'pode enviar',
    'manda',
    'si',
  ]
  const cancelCases = ['no', 'n', 'cancel', 'stop', "don't send", 'não', 'cancela']
  const unclearCases = ['maybe later', 'what will it say?', 'build a new deck']

  it.each(confirmCases)('%s -> confirm', (text) => {
    expect(interpretConfirmationReply(text)).toBe('confirm')
  })

  it.each(cancelCases)('%s -> cancel', (text) => {
    expect(interpretConfirmationReply(text)).toBe('cancel')
  })

  it.each(unclearCases)('%s -> unclear (does not over-match)', (text) => {
    expect(interpretConfirmationReply(text)).toBe('unclear')
  })

  it('a longer sentence starting with a confirm word still matches confirm', () => {
    expect(interpretConfirmationReply('yes please send it')).toBe('confirm')
  })
})

describe('explainSendGateRefusal', () => {
  const knownReasons = [
    'suppressed',
    'no_consent',
    'quiet_hours',
    'unresolvable_timezone',
    'client_not_found',
    'integrity_error',
  ]

  it('each known reason returns a distinct non-empty string', () => {
    const explanations = knownReasons.map((r) => explainSendGateRefusal(r))
    for (const e of explanations) {
      expect(e.length).toBeGreaterThan(0)
    }
    expect(new Set(explanations).size).toBe(knownReasons.length)
  })

  it('undefined -> non-empty generic fallback', () => {
    const e = explainSendGateRefusal(undefined)
    expect(e.length).toBeGreaterThan(0)
  })

  it('an unknown string -> non-empty generic fallback', () => {
    const e = explainSendGateRefusal('some_new_reason_nobody_added_yet')
    expect(e.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// DB-backed functions — hand-built SupabaseClient mocks
// ---------------------------------------------------------------------------

/** Self-returning chain mock (mirrors owner-phone.test.ts's `chain` pattern):
 * every chain method is the SAME vi.fn(), so `.mock.calls` records the exact
 * call sequence/args for assertion, and the terminal method resolves. */
function makeChainClient(terminalMethod: string, resolved: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methodNames = ['select', 'eq', 'gt', 'order', 'insert', 'update']
  for (const name of methodNames) {
    if (name === terminalMethod) continue
    chain[name] = vi.fn().mockReturnValue(chain)
  }
  chain[terminalMethod] = vi.fn().mockResolvedValue(resolved)
  const from = vi.fn().mockReturnValue(chain)
  const client = { from } as unknown as SupabaseClient
  return { client, chain, from }
}

describe('createSendConfirmation', () => {
  it('agentic-mcp -> non-null uuid-shaped token passed in insert, owner_phone null', async () => {
    const insertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null }),
      }),
    })
    const from = vi.fn().mockReturnValue({ insert: insertSpy })
    const client = { from } as unknown as SupabaseClient

    const result = await createSendConfirmation(client, {
      companyId: 'company-1',
      clientId: 'client-1',
      channel: 'email',
      body: 'Here is your estimate.',
      triggerSource: 'agentic-mcp',
    })

    expect(result.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        token: result.token,
        owner_phone: null,
        trigger_source: 'agentic-mcp',
        body_hash: computeBodyHash('client-1', 'email', 'Here is your estimate.', undefined),
      }),
    )
  })

  it('agentic-whatsapp -> token null in insert, owner_phone = params.channelRef', async () => {
    const insertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'row-2' }, error: null }),
      }),
    })
    const from = vi.fn().mockReturnValue({ insert: insertSpy })
    const client = { from } as unknown as SupabaseClient

    const result = await createSendConfirmation(client, {
      companyId: 'company-1',
      clientId: 'client-1',
      channel: 'sms',
      body: 'Here is your estimate.',
      triggerSource: 'agentic-whatsapp',
      channelRef: '+15551234567',
    })

    expect(result.token).toBeNull()
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        token: null,
        owner_phone: '+15551234567',
        trigger_source: 'agentic-whatsapp',
      }),
    )
  })

  it('expires_at is ~CONFIRMATION_TTL_MINUTES minutes out', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T12:00:00Z'))
    const insertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'row-3' }, error: null }),
      }),
    })
    const from = vi.fn().mockReturnValue({ insert: insertSpy })
    const client = { from } as unknown as SupabaseClient

    const result = await createSendConfirmation(client, {
      companyId: 'company-1',
      clientId: 'client-1',
      channel: 'sms',
      body: 'x',
      triggerSource: 'agentic-whatsapp',
      channelRef: '+15551234567',
    })

    const expected = new Date(
      Date.parse('2026-07-21T12:00:00Z') + CONFIRMATION_TTL_MINUTES * 60_000,
    ).toISOString()
    expect(result.expiresAt).toBe(expected)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ expires_at: expected }))
    vi.useRealTimers()
  })

  it('insert failure throws (the ONE function allowed to throw)', async () => {
    const insertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
      }),
    })
    const from = vi.fn().mockReturnValue({ insert: insertSpy })
    const client = { from } as unknown as SupabaseClient

    await expect(
      createSendConfirmation(client, {
        companyId: 'company-1',
        clientId: 'client-1',
        channel: 'sms',
        body: 'x',
        triggerSource: 'agentic-whatsapp',
        channelRef: '+15551234567',
      }),
    ).rejects.toThrow()
  })
})

describe('resolvePendingByChannelRef', () => {
  const DB_ROW = {
    id: 'row-1',
    company_id: 'company-1',
    client_id: 'client-1',
    channel: 'sms',
    subject: null,
    body: 'hi',
    body_hash: 'hash-1',
    trigger_source: 'agentic-whatsapp',
    owner_phone: '+15551234567',
    token: null,
    status: 'pending',
    expires_at: '2026-07-21T12:10:00.000Z',
  }

  it('builds the exact filter chain (scoping proof) with order/limit(1) for multi-pending safety', async () => {
    const { client, chain } = makeChainClient('limit', { data: [DB_ROW], error: null })

    const result = await resolvePendingByChannelRef(client, 'company-1', '+15551234567')

    expect(chain.select).toHaveBeenCalledWith(expect.any(String))
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1')
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'owner_phone', '+15551234567')
    expect(chain.eq).toHaveBeenNthCalledWith(3, 'trigger_source', 'agentic-whatsapp')
    expect(chain.eq).toHaveBeenNthCalledWith(4, 'status', 'pending')
    expect(chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String))
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(result).not.toBeNull()
  })

  it('maps DB snake_case -> camelCase PendingSendConfirmation shape (channelRef reads from owner_phone)', async () => {
    const { client } = makeChainClient('limit', { data: [DB_ROW], error: null })

    const result = await resolvePendingByChannelRef(client, 'company-1', '+15551234567')

    expect(result).toEqual({
      id: 'row-1',
      companyId: 'company-1',
      clientId: 'client-1',
      channel: 'sms',
      subject: null,
      body: 'hi',
      bodyHash: 'hash-1',
      triggerSource: 'agentic-whatsapp',
      channelRef: '+15551234567',
      token: null,
      status: 'pending',
      expiresAt: '2026-07-21T12:10:00.000Z',
    })
  })

  it('data: null -> resolves null', async () => {
    const { client } = makeChainClient('limit', { data: null, error: null })
    const result = await resolvePendingByChannelRef(client, 'company-1', '+15551234567')
    expect(result).toBeNull()
  })

  it('data: [] (no pending rows) -> resolves null', async () => {
    const { client } = makeChainClient('limit', { data: [], error: null })
    const result = await resolvePendingByChannelRef(client, 'company-1', '+15551234567')
    expect(result).toBeNull()
  })

  it('LOAD-BEARING never-throw proof: .from() returns an object with NO .select method -> resolves null, does not throw/reject', async () => {
    const from = vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) })
    const client = { from } as unknown as SupabaseClient
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(resolvePendingByChannelRef(client, 'company-1', '+15551234567')).resolves.toBeNull()
  })

  it('a DB error -> resolves null (never throws)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = makeChainClient('limit', { data: null, error: { message: 'boom' } })
    await expect(resolvePendingByChannelRef(client, 'company-1', '+15551234567')).resolves.toBeNull()
  })
})

describe('resolveByToken', () => {
  const DB_ROW = {
    id: 'row-2',
    company_id: 'company-1',
    client_id: 'client-1',
    channel: 'email',
    subject: 'Your estimate',
    body: 'hi',
    body_hash: 'hash-2',
    trigger_source: 'agentic-mcp',
    owner_phone: null,
    token: 'tok-abc',
    status: 'pending',
    expires_at: '2026-07-21T12:10:00.000Z',
  }

  it('builds the company-scoped filter chain (a guessed token from another company can never resolve)', async () => {
    const { client, chain } = makeChainClient('maybeSingle', { data: DB_ROW, error: null })
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: DB_ROW, error: null })

    const result = await resolveByToken(client, 'company-1', 'tok-abc')

    expect(chain.eq).toHaveBeenNthCalledWith(1, 'token', 'tok-abc')
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'company_id', 'company-1')
    expect(chain.eq).toHaveBeenNthCalledWith(3, 'trigger_source', 'agentic-mcp')
    expect(chain.eq).toHaveBeenNthCalledWith(4, 'status', 'pending')
    expect(chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String))
    expect(result?.channelRef).toBeNull()
    expect(result?.token).toBe('tok-abc')
  })

  it('data: null -> resolves null', async () => {
    const { client } = makeChainClient('maybeSingle', { data: null, error: null })
    const result = await resolveByToken(client, 'company-1', 'tok-abc')
    expect(result).toBeNull()
  })

  it('LOAD-BEARING never-throw proof: .from() returns an object with NO .select method -> resolves null, does not throw/reject', async () => {
    const from = vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) })
    const client = { from } as unknown as SupabaseClient
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(resolveByToken(client, 'company-1', 'tok-abc')).resolves.toBeNull()
  })

  it('a DB error -> resolves null (never throws)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = makeChainClient('maybeSingle', { data: null, error: { message: 'boom' } })
    await expect(resolveByToken(client, 'company-1', 'tok-abc')).resolves.toBeNull()
  })
})

describe('markConfirmed — CLAIM-BEFORE-DISPATCH atomic conditional claim', () => {
  /** Synchronous compare-and-swap mock: mirrors an atomic
   * `UPDATE ... SET status='confirmed' WHERE id=? AND status='pending'`.
   * The check-and-flip happens the instant `.select()` is CALLED (not when
   * the returned promise resolves), so two calls issued back-to-back before
   * either awaits correctly simulate DB-level atomicity under Promise.all. */
  function makeClaimClient(initialStatus: 'pending' | 'confirmed' = 'pending') {
    let status = initialStatus
    const select = vi.fn().mockImplementation(() => {
      if (status === 'pending') {
        status = 'confirmed'
        return Promise.resolve({ data: [{ id: 'row-1' }], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    })
    const eq2 = vi.fn().mockReturnValue({ select })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const update = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ update })
    const client = { from } as unknown as SupabaseClient
    return { client, update, eq1, eq2, select, getStatus: () => status }
  }

  it('claims a pending row: WHERE id=? AND status=pending, sets confirmed_at, returns true', async () => {
    const { client, update, eq1, eq2 } = makeClaimClient('pending')

    const result = await markConfirmed(client, 'row-1')

    expect(result).toBe(true)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed', confirmed_at: expect.any(String) }),
    )
    expect(eq1).toHaveBeenCalledWith('id', 'row-1')
    expect(eq2).toHaveBeenCalledWith('status', 'pending')
  })

  it('claiming an already-confirmed row returns false (no row matched)', async () => {
    const { client } = makeClaimClient('confirmed')
    const result = await markConfirmed(client, 'row-1')
    expect(result).toBe(false)
  })

  it('two concurrent claims on the same pending row -> exactly one wins', async () => {
    const { client } = makeClaimClient('pending')

    const [a, b] = await Promise.all([markConfirmed(client, 'row-1'), markConfirmed(client, 'row-1')])

    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('swallows an update error -> returns false, never throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq2 = vi.fn().mockReturnValue({ select })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const update = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn().mockReturnValue({ update })
    const client = { from } as unknown as SupabaseClient

    await expect(markConfirmed(client, 'row-1')).resolves.toBe(false)
  })

  it('an unexpected throw from the client -> returns false, never rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const from = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    const client = { from } as unknown as SupabaseClient

    await expect(markConfirmed(client, 'row-1')).resolves.toBe(false)
  })
})

describe('markCancelled / markRefused', () => {
  function makeUpdateClient(resolved: { error: unknown } = { error: null }) {
    const eq = vi.fn().mockResolvedValue(resolved)
    const update = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ update })
    const client = { from } as unknown as SupabaseClient
    return { client, update, eq }
  }

  it('markCancelled calls update({status:"cancelled"}).eq("id", id), leaves confirmed_at untouched', async () => {
    const { client, update, eq } = makeUpdateClient()
    await markCancelled(client, 'row-1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
    expect(update.mock.calls[0]![0]).not.toHaveProperty('confirmed_at')
    expect(eq).toHaveBeenCalledWith('id', 'row-1')
  })

  it('markRefused calls update({status:"refused"}).eq("id", id), leaves confirmed_at untouched', async () => {
    const { client, update, eq } = makeUpdateClient()
    await markRefused(client, 'row-1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'refused' }))
    expect(update.mock.calls[0]![0]).not.toHaveProperty('confirmed_at')
    expect(eq).toHaveBeenCalledWith('id', 'row-1')
  })

  it('markCancelled swallows an update error, never throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = makeUpdateClient({ error: { message: 'boom' } })
    await expect(markCancelled(client, 'row-1')).resolves.toBeUndefined()
  })

  it('markRefused swallows an unexpected throw, never rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const from = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    const client = { from } as unknown as SupabaseClient
    await expect(markRefused(client, 'row-1')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Rate limit wrapper — FAIL-CLOSED (deviation from lib/ratelimit.ts's normal
// fail-open posture, ratified for Phase 178: real-money irreversible sends
// to third parties; the per-send confirmation gate bounds the UX impact).
// ---------------------------------------------------------------------------

describe('checkAgenticSendRateLimit', () => {
  beforeEach(() => {
    mockIsRedisAvailable.mockReturnValue(true)
  })

  it('calls rateLimit with the exact limit name and companyId (not a user id) as identifier', async () => {
    mockRateLimit.mockResolvedValue({ allowed: true, count: 3, max: 10 })
    await checkAgenticSendRateLimit('company-42')
    expect(mockRateLimit).toHaveBeenCalledWith('agenticSendPerCompanyPerDay', 'company-42')
  })

  it('pass-through true when genuinely allowed (count >= 1)', async () => {
    mockRateLimit.mockResolvedValue({ allowed: true, count: 3, max: 10 })
    await expect(checkAgenticSendRateLimit('company-1')).resolves.toBe(true)
  })

  it('pass-through false when genuinely blocked (over the cap)', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 11, max: 10, retryAfter: 3600 })
    await expect(checkAgenticSendRateLimit('company-1')).resolves.toBe(false)
  })

  it('FAIL-CLOSED: Redis unconfigured -> false (never calls rateLimit)', async () => {
    mockIsRedisAvailable.mockReturnValue(false)
    await expect(checkAgenticSendRateLimit('company-1')).resolves.toBe(false)
    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it('FAIL-CLOSED: Redis errors mid-request (rateLimit fails open internally, count:0) -> false', async () => {
    // Mirrors lib/ratelimit.ts's own fail-open sentinel shape for both the
    // "Redis unconfigured" and "Redis errored" internal paths.
    mockRateLimit.mockResolvedValue({ allowed: true, count: 0, max: 10 })
    await expect(checkAgenticSendRateLimit('company-1')).resolves.toBe(false)
  })
})
