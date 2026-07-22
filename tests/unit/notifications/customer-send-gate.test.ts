import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

/**
 * Phase 176 Plan 04 (CUST-03 + CUST-04) — assertSendAllowed() is the ONE
 * pre-send gate Phase 177/178's actual send functions will call before
 * every end-customer SMS dispatch. Composition order (LOAD-BEARING):
 * client_not_found -> suppressed -> no_consent -> unresolvable_timezone ->
 * quiet_hours -> allowed (SendPermit).
 *
 * Part A tests the pure isConsentSendable() helper (no mocks). Part B
 * mocks '@/lib/supabase/service' and drives the full composition against a
 * mocked `clients`/`companies` chained-query shape (mirrors
 * tests/unit/whatsapp/webhook-route.test.ts's `.from().select().eq().eq()
 * .maybeSingle()` mock style). Real (non-mocked) resolveRecipientZones /
 * isWithinQuietHours run underneath so the ordering/short-circuit proof is
 * against real behavior, with vi.useFakeTimers() controlling the instant.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

type Row = Record<string, unknown> | null

/** Builds a `.select().eq().eq().maybeSingle()`-shaped mock for `clients`. */
function makeClientsQuery(data: Row, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  return { select, eq1, eq2, maybeSingle }
}

/** Builds a `.select().eq().maybeSingle()`-shaped mock for `companies`. */
function makeCompaniesQuery(data: Row, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, maybeSingle }
}

function buildServiceClient(clientRow: Row, companyRow: Row, opts: {
  clientError?: { message: string } | null
  companyError?: { message: string } | null
} = {}) {
  const clientsQuery = makeClientsQuery(clientRow, opts.clientError ?? null)
  const companiesQuery = makeCompaniesQuery(companyRow, opts.companyError ?? null)
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'clients') return clientsQuery
    if (table === 'companies') return companiesQuery
    throw new Error(`unexpected table: ${table}`)
  })
  return { from, clientsQuery, companiesQuery }
}

const CLEAR_CLIENT = {
  sms_opted_out_at: null,
  sms_consent_status: 'granted',
  state: 'NY',
  phone: '+15551234567',
}
const CLEAR_COMPANY = { state: 'NY' }

describe('lib/notifications/customer-send-gate — isConsentSendable() (pure)', () => {
  it("'granted' -> true (default flag)", async () => {
    const { isConsentSendable } = await import('@/lib/notifications/customer-send-gate')
    expect(isConsentSendable('granted')).toBe(true)
  })

  it("'granted' -> true even when flag flipped true (flag irrelevant to granted)", async () => {
    const { isConsentSendable } = await import('@/lib/notifications/customer-send-gate')
    expect(isConsentSendable('granted', true)).toBe(true)
  })

  it("'revoked' -> false (default flag)", async () => {
    const { isConsentSendable } = await import('@/lib/notifications/customer-send-gate')
    expect(isConsentSendable('revoked')).toBe(false)
  })

  it("'revoked' -> false even when flag flipped true (revocation is NEVER overridden)", async () => {
    const { isConsentSendable } = await import('@/lib/notifications/customer-send-gate')
    expect(isConsentSendable('revoked', true)).toBe(false)
  })

  it("'unknown' -> false (matches default UNKNOWN_CONSENT_IS_SENDABLE = false)", async () => {
    const { isConsentSendable } = await import('@/lib/notifications/customer-send-gate')
    expect(isConsentSendable('unknown')).toBe(false)
  })

  it("'unknown' -> true when flag flipped true (load-bearing flag-flip wiring proof)", async () => {
    const { isConsentSendable } = await import('@/lib/notifications/customer-send-gate')
    expect(isConsentSendable('unknown', true)).toBe(true)
  })

  it('unexpected/garbage status -> false (fail closed)', async () => {
    const { isConsentSendable } = await import('@/lib/notifications/customer-send-gate')
    expect(isConsentSendable('garbage_unexpected_value')).toBe(false)
  })
})

describe('lib/notifications/customer-send-gate — assertSendAllowed() (composition)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('client row not found -> { allowed: false, reason: client_not_found }, no permit', async () => {
    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(null, CLEAR_COMPANY)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await assertSendAllowed('company-1', 'client-1', 'sms')
    expect(result).toEqual({ allowed: false, reason: 'client_not_found' })
    expect(result.permit).toBeUndefined()
  })

  it('sms_opted_out_at set -> suppressed, even with granted consent + mid-day local time', async () => {
    vi.useFakeTimers()
    // Noon EDT (NY, UTC-4 mid-summer) = 16:00 UTC — squarely within quiet hours.
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))

    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(
      { ...CLEAR_CLIENT, sms_opted_out_at: '2026-07-01T00:00:00Z' },
      CLEAR_COMPANY,
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await assertSendAllowed('company-1', 'client-1', 'sms')
    expect(result).toEqual({ allowed: false, reason: 'suppressed' })
  })

  it("sms_consent_status 'unknown' -> no_consent (default flag)", async () => {
    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(
      { ...CLEAR_CLIENT, sms_consent_status: 'unknown' },
      CLEAR_COMPANY,
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await assertSendAllowed('company-1', 'client-1', 'sms')
    expect(result).toEqual({ allowed: false, reason: 'no_consent' })
  })

  it("sms_consent_status 'revoked' -> no_consent", async () => {
    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(
      { ...CLEAR_CLIENT, sms_consent_status: 'revoked' },
      CLEAR_COMPANY,
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await assertSendAllowed('company-1', 'client-1', 'sms')
    expect(result).toEqual({ allowed: false, reason: 'no_consent' })
  })

  it('granted consent but state/phone/company.state all unresolvable -> unresolvable_timezone', async () => {
    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(
      { ...CLEAR_CLIENT, state: null, phone: null },
      { state: null },
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await assertSendAllowed('company-1', 'client-1', 'sms')
    expect(result).toEqual({ allowed: false, reason: 'unresolvable_timezone' })
  })

  it('granted consent, resolvable zone, but instant is outside 8am-8pm local -> quiet_hours', async () => {
    vi.useFakeTimers()
    // 3:00am EDT (NY, UTC-4 mid-summer) = 07:00 UTC — outside the window.
    vi.setSystemTime(new Date('2026-07-15T07:00:00Z'))

    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(CLEAR_CLIENT, CLEAR_COMPANY)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await assertSendAllowed('company-1', 'client-1', 'sms')
    expect(result).toEqual({ allowed: false, reason: 'quiet_hours' })
  })

  it('fully clear (consented, not suppressed, within quiet hours) -> allowed with SendPermit', async () => {
    vi.useFakeTimers()
    // Noon EDT (NY) = 16:00 UTC — within the window.
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))

    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(CLEAR_CLIENT, CLEAR_COMPANY)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await assertSendAllowed('company-42', 'client-99', 'sms')
    expect(result.allowed).toBe(true)
    expect(result.permit).toBeDefined()
    expect(result.permit).toMatchObject({
      __brand: 'SendPermit',
      clientId: 'client-99',
      channel: 'sms',
    })
    expect(new Date(result.permit!.grantedAt).toString()).not.toBe('Invalid Date')
  })

  it('ordering proof: suppressed AND would-fail-quiet-hours -> reason is suppressed (short-circuits before #4)', async () => {
    vi.useFakeTimers()
    // 3:00am EDT — would fail quiet-hours if reached.
    vi.setSystemTime(new Date('2026-07-15T07:00:00Z'))

    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(
      { ...CLEAR_CLIENT, sms_opted_out_at: '2026-07-01T00:00:00Z' },
      CLEAR_COMPANY,
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await assertSendAllowed('company-1', 'client-1', 'sms')
    expect(result).toEqual({ allowed: false, reason: 'suppressed' })
    // Suppression short-circuits before the companies (quiet-hours-only) fetch ever runs.
    expect(svc.companiesQuery.select).not.toHaveBeenCalled()
  })

  it('DB query scopes by BOTH id and company_id (tenant-scope defense-in-depth)', async () => {
    const { assertSendAllowed } = await import('@/lib/notifications/customer-send-gate')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = buildServiceClient(CLEAR_CLIENT, CLEAR_COMPANY)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))

    await assertSendAllowed('tenant-company-id', 'the-client-id', 'sms')

    const eqCalls = [
      ...svc.clientsQuery.eq1.mock.calls,
      ...svc.clientsQuery.eq2.mock.calls,
    ]
    expect(eqCalls).toContainEqual(['id', 'the-client-id'])
    expect(eqCalls).toContainEqual(['company_id', 'tenant-company-id'])
  })
})
