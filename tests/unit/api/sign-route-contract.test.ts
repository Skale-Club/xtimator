import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { canonicalJsonStringify } from '@/lib/estimate/signed-snapshot'
import { computeContentFingerprint } from '@/lib/estimate/content-fingerprint'

/**
 * Security-hardening S2 — public sign route contract.
 *
 * Covers the fixes landed in app/api/estimates/[id]/sign/route.ts:
 *   - signatureData validation (audit finding a — SSRF + unbounded row size):
 *     only a data:image/png;base64,... URL whose decoded bytes start with the
 *     PNG magic number and stay under the size cap is accepted.
 *   - signerEmail validation (optional, format + length bounded).
 *   - sign_estimate_atomic RPC error-code mapping. Lock-at-acceptance: the
 *     client must send the content version (updated_at) it rendered; a
 *     mismatch, a missing version or a P0007 conflict is a 409 estimate_updated
 *     with NO re-read-and-retry (that would sign unseen content), and a
 *     superseded version is a 409 estimate_superseded.
 *
 * Mirrors the mocking style of tests/unit/api/refine-lock-guard.test.ts /
 * tests/unit/api/refine-route-contract.test.ts: mock the service boundaries
 * (supabase, demo guard, rate limit, notification helper), drive the route's
 * real POST handler, assert on status/body/call counts.
 */

const mockRequireServiceClient = vi.fn()
const mockDemoGuard = vi.fn()
const mockRateLimit = vi.fn()
const mockNotify = vi.fn()
const mockHeaders = vi.fn()
const mockCookieGet = vi.fn()
const mockHasValidUnlock = vi.fn()

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
  cookies: async () => ({ get: (name: string) => mockCookieGet(name) }),
}))
vi.mock('@/lib/auth/share-password', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/share-password')>()),
  hasValidUnlock: (...args: unknown[]) => mockHasValidUnlock(...args),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => mockRequireServiceClient(),
}))
vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: (...args: unknown[]) => mockDemoGuard(...args),
}))
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))
vi.mock('@/lib/estimate/notify-response', () => ({
  notifyEstimateResponse: (...args: unknown[]) => mockNotify(...args),
}))

import { POST } from '@/app/api/estimates/[id]/sign/route'

// The content version the (simulated) public page rendered: matches estimateRow().updated_at.
const PAGE_VERSION = '2026-07-29T00:00:00.000Z'

// The fingerprint the (simulated) public page was rendered with: the default
// estimate row, no sections, the default company terms. Lazy because the
// fixtures it reads are declared further down.
function pageFingerprint(sections: unknown[] = [], company: Record<string, unknown> = COMPANY_ROW): string {
  return computeContentFingerprint(estimateRow(), sections as never, company)
}

// Pass `contentVersion: undefined` / `contentFingerprint: undefined` to simulate
// a client that sends none.
function jsonRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/estimates/est-1/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentVersion: PAGE_VERSION, contentFingerprint: pageFingerprint(), ...body }),
  })
}

const PARAMS = { params: Promise.resolve({ id: 'est-1' }) }

// A real, well-known minimal 1x1 transparent PNG (43 bytes decoded).
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`

function estimateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'est-1',
    company_id: 'company-1',
    project_id: 'proj-1',
    share_token: 'share-token-abc',
    client_response: null,
    is_current: true,
    updated_at: '2026-07-29T00:00:00.000Z',
    summary: 'Kitchen remodel',
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    estimate_date: '2026-07-10',
    estimate_number: 'EST-1001',
    subtotal: 1000,
    tax_rate: 0,
    tax_amount: 0,
    discount_type: null,
    discount_value: null,
    discount_amount: null,
    deposit_type: null,
    deposit_value: null,
    balance_due: 1000,
    total: 1000,
    currency_code: 'USD',
    presentation_settings: null,
    ...overrides,
  }
}

const COMPANY_ROW = {
  digital_signature_enabled: true,
  estimate_terms_enabled: false,
  estimate_terms_text: null,
}

const RPC_SUCCESS_RESULT = {
  project_id: 'proj-1',
  company_id: 'company-1',
  estimate_number: 'EST-1001',
  client_name: 'Bob',
}

function makeChain(resolveValue: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolveValue)
  // estimate_sections is awaited directly (no .single()) — make the chain
  // object itself thenable so `await supabase.from(...).select(...)...` works.
  chain.then = (resolve: (v: unknown) => unknown) => resolve(resolveValue)
  return chain
}

interface SupabaseTestConfig {
  /** Consumed in order across successive `.from('estimates')` calls (initial read, then any conflict-retry re-read). Last entry repeats if exhausted. */
  estimateRows: Array<Record<string, unknown>>
  companyRow?: Record<string, unknown> | null
  sectionsRows?: unknown[]
  /** Rows returned for estimate_signatures (the idempotent-retry lookup). */
  signatureRows?: unknown[]
  rpcHandler: (params: Record<string, unknown>, callIndex: number) => { data: unknown; error: unknown }
}

function buildSupabase(config: SupabaseTestConfig) {
  let estimateCallIndex = 0
  let rpcCallIndex = 0
  const rpcMock = vi.fn().mockImplementation(async (_name: string, params: Record<string, unknown>) => {
    const result = config.rpcHandler(params, rpcCallIndex)
    rpcCallIndex++
    return result
  })
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'estimates') {
      const idx = Math.min(estimateCallIndex, config.estimateRows.length - 1)
      estimateCallIndex++
      return makeChain({ data: config.estimateRows[idx] ?? null, error: null })
    }
    if (table === 'companies') {
      return makeChain({ data: config.companyRow ?? COMPANY_ROW, error: null })
    }
    if (table === 'estimate_signatures') {
      return makeChain({ data: config.signatureRows ?? [], error: null })
    }
    if (table === 'estimate_sections') {
      return makeChain({ data: config.sectionsRows ?? [], error: null })
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { from: fromMock, rpc: rpcMock, __rpcMock: rpcMock, __fromMock: fromMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDemoGuard.mockResolvedValue(null)
  mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 10 })
  mockNotify.mockResolvedValue(undefined)
  // Fix-pack F1 (finding #5): x-real-ip is no longer trusted at all — the
  // resolved IP is now the LAST x-forwarded-for entry (or null). x-real-ip
  // is included here anyway, unused, to prove it is genuinely ignored rather
  // than merely deprioritized (see the dedicated describe block below).
  mockHeaders.mockReturnValue(
    new Headers({
      'x-real-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 203.0.113.9',
      'user-agent': 'vitest',
    })
  )
})

describe('signatureData validation (audit finding a — SSRF + unbounded row size)', () => {
  function configureSuccess() {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)
    return supabase
  }

  it('rejects an http(s) URL instead of a data URI (the SSRF vector)', async () => {
    const supabase = configureSuccess()
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signatureData: 'http://internal-host/steal-metadata',
      }),
      PARAMS
    )
    expect(res.status).toBe(400)
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a data:image/svg+xml URL (only PNG is allowed)', async () => {
    const supabase = configureSuccess()
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signatureData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      }),
      PARAMS
    )
    expect(res.status).toBe(400)
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized payload (> 200KB decoded)', async () => {
    const supabase = configureSuccess()
    const oversized = Buffer.alloc(200 * 1024 + 1, 0x41) // 'A' filler, well past the cap
    const magicPrefixed = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      oversized,
    ])
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signatureData: `data:image/png;base64,${magicPrefixed.toString('base64')}`,
      }),
      PARAMS
    )
    expect(res.status).toBe(400)
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('rejects valid base64 that decodes to non-PNG bytes (wrong magic number)', async () => {
    const supabase = configureSuccess()
    const notPng = Buffer.from('this is definitely not a png file').toString('base64')
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signatureData: `data:image/png;base64,${notPng}`,
      }),
      PARAMS
    )
    expect(res.status).toBe(400)
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a string with invalid base64 characters after the prefix', async () => {
    const supabase = configureSuccess()
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signatureData: 'data:image/png;base64,not-valid-base64!!! ###',
      }),
      PARAMS
    )
    expect(res.status).toBe(400)
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('accepts a real tiny PNG data URL', async () => {
    const supabase = configureSuccess()
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signatureData: TINY_PNG_DATA_URL,
      }),
      PARAMS
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
  })
})

describe('signerEmail validation', () => {
  function configureSuccess() {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)
    return supabase
  }

  it('accepts a well-formed email and passes it through to the RPC', async () => {
    const supabase = configureSuccess()
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signerEmail: 'jane@example.com',
        signatureData: TINY_PNG_DATA_URL,
      }),
      PARAMS
    )
    expect(res.status).toBe(200)
    const [, rpcParams] = supabase.__rpcMock.mock.calls[0]
    expect(rpcParams.p_signer_email).toBe('jane@example.com')
  })

  it('omitted signerEmail is treated as null (optional field)', async () => {
    const supabase = configureSuccess()
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signatureData: TINY_PNG_DATA_URL,
      }),
      PARAMS
    )
    expect(res.status).toBe(200)
    const [, rpcParams] = supabase.__rpcMock.mock.calls[0]
    expect(rpcParams.p_signer_email).toBeNull()
  })

  it('rejects a malformed email (no @/domain)', async () => {
    const supabase = configureSuccess()
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signerEmail: 'not-an-email',
        signatureData: TINY_PNG_DATA_URL,
      }),
      PARAMS
    )
    expect(res.status).toBe(400)
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized email (> 320 chars)', async () => {
    const supabase = configureSuccess()
    const longEmail = `${'a'.repeat(316)}@x.co`
    expect(longEmail.length).toBeGreaterThan(320)
    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        signerName: 'Jane Doe',
        signerEmail: longEmail,
        signatureData: TINY_PNG_DATA_URL,
      }),
      PARAMS
    )
    expect(res.status).toBe(400)
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })
})

describe('sign_estimate_atomic RPC error-code mapping', () => {
  it('estimate_not_found (P0006) -> 404', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: null, error: { code: 'P0006', message: 'estimate_not_found' } }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )
    expect(res.status).toBe(404)
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
  })

  it('estimate_already_responded (P0008) -> 409, no retry', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({
        data: null,
        error: { code: 'P0008', message: 'estimate_already_responded' },
      }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )
    expect(res.status).toBe(409)
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
  })

  it('an unrecognized rpc error code -> 500, no retry', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: null, error: { code: 'XX000', message: 'boom' } }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )
    expect(res.status).toBe(500)
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
  })

  it('estimate_conflict (P0007) -> 409 estimate_updated and NO retry (a retry would sign unseen content)', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow(), estimateRow({ updated_at: '2026-07-29T00:05:00.000Z' })],
      rpcHandler: () => ({ data: null, error: { code: 'P0007', message: 'estimate_conflict' } }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'estimate_updated' })
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
    // Only the initial estimate read: the route must not re-read to retry.
    const estimateReads = supabase.__fromMock.mock.calls.filter(([t]: [string]) => t === 'estimates')
    expect(estimateReads).toHaveLength(1)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('estimate_not_current (P0009) -> 409 estimate_superseded', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: null, error: { code: 'P0009', message: 'estimate_not_current' } }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'estimate_superseded' })
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
  })

  it('success fires the post-RPC accept notification exactly once, with the RPC result fields', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(200)
    expect(mockNotify).toHaveBeenCalledOnce()
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'est-1',
        project_id: RPC_SUCCESS_RESULT.project_id,
        company_id: RPC_SUCCESS_RESULT.company_id,
        estimate_number: RPC_SUCCESS_RESULT.estimate_number,
        client_name: RPC_SUCCESS_RESULT.client_name,
      }),
      'accepted'
    )
  })

  it('a notification failure never fails the request (best-effort)', async () => {
    mockNotify.mockRejectedValue(new Error('resend down'))
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })
})

describe('lock-at-acceptance: signing exactly the content the client loaded', () => {
  function configure(rowOverrides: Record<string, unknown> = {}) {
    const supabase = buildSupabase({
      estimateRows: [estimateRow(rowOverrides)],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)
    return supabase
  }
  const BASE = { token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }

  it('passes the CLIENT version (not a fresh read) as p_expected_updated_at', async () => {
    const supabase = configure()
    const res = await POST(jsonRequest(BASE), PARAMS)
    expect(res.status).toBe(200)
    const [, rpcParams] = supabase.__rpcMock.mock.calls[0]
    expect(rpcParams.p_expected_updated_at).toBe(PAGE_VERSION)
  })

  it('a sent estimate edited after the page loaded -> 409 estimate_updated, nothing signed', async () => {
    const supabase = configure({ updated_at: '2026-07-29T00:05:00.000Z' })
    const res = await POST(jsonRequest(BASE), PARAMS)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'estimate_updated' })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('a missing contentVersion -> 409 estimate_updated, nothing signed', async () => {
    const supabase = configure()
    const res = await POST(jsonRequest({ ...BASE, contentVersion: undefined }), PARAMS)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'estimate_updated' })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('compares versions as instants: a different timestamp format for the same moment is accepted', async () => {
    const supabase = configure({ updated_at: '2026-07-29T00:00:00+00:00' })
    const res = await POST(jsonRequest({ ...BASE, contentVersion: '2026-07-29T00:00:00.000Z' }), PARAMS)
    expect(res.status).toBe(200)
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
  })

  it('a superseded version (is_current = false) -> 409 estimate_superseded, nothing signed', async () => {
    const supabase = configure({ is_current: false })
    const res = await POST(jsonRequest(BASE), PARAMS)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'estimate_superseded' })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })
})

// The version token only covers the estimate and its lines. The fingerprint
// covers everything the snapshot freezes, company terms included, and is
// compared against the rows the route reads at signing time.
describe('content fingerprint: signing exactly the document the page rendered', () => {
  const BASE = { token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }
  const SECTION = {
    id: 's1',
    title: 'Labor',
    sort_order: 0,
    subtotal: 1000,
    items: [{ id: 'i1', description: 'Demo old cabinets', quantity: 1, unit: 'each', unit_price: 1000, total: 1000, sort_order: 0 }],
  }

  function configure(config: { sectionsRows?: unknown[]; companyRow?: Record<string, unknown> } = {}) {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
      ...config,
    })
    mockRequireServiceClient.mockReturnValue(supabase)
    return supabase
  }

  it('the page fingerprint is exactly the snapshot hash stored with the signature', async () => {
    const supabase = configure({ sectionsRows: [SECTION] })
    const fingerprint = pageFingerprint([SECTION])
    const res = await POST(jsonRequest({ ...BASE, contentFingerprint: fingerprint }), PARAMS)
    expect(res.status).toBe(200)
    const [, rpcParams] = supabase.__rpcMock.mock.calls[0]
    expect(rpcParams.p_snapshot_sha256).toBe(fingerprint)
  })

  it('a line reworded after the page loaded (same totals, same version) -> 409 estimate_updated, nothing signed', async () => {
    const reworded = { ...SECTION, items: [{ ...SECTION.items[0], description: 'Demo old cabinets and haul away' }] }
    const supabase = configure({ sectionsRows: [reworded] })
    const res = await POST(jsonRequest({ ...BASE, contentFingerprint: pageFingerprint([SECTION]) }), PARAMS)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'estimate_updated' })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('company terms edited after the page loaded -> 409 estimate_updated, nothing signed', async () => {
    const supabase = configure({
      companyRow: { digital_signature_enabled: true, estimate_terms_enabled: true, estimate_terms_text: 'Net 30. No refunds.' },
    })
    const loadedWith = pageFingerprint([], {
      digital_signature_enabled: true,
      estimate_terms_enabled: true,
      estimate_terms_text: 'Net 15.',
    })
    const res = await POST(jsonRequest({ ...BASE, contentFingerprint: loadedWith }), PARAMS)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'estimate_updated' })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('a page rendered before the check existed (no fingerprint) -> 409 estimate_updated, no content read', async () => {
    const supabase = configure()
    const res = await POST(jsonRequest({ ...BASE, contentFingerprint: undefined }), PARAMS)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'estimate_updated' })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
    const sectionReads = supabase.__fromMock.mock.calls.filter(([t]: [string]) => t === 'estimate_sections')
    expect(sectionReads).toHaveLength(0)
  })

  it.each([[''], [42], [{ hash: 'x' }]])('a malformed fingerprint (%j) -> 409 estimate_updated', async (bad) => {
    const supabase = configure()
    const res = await POST(jsonRequest({ ...BASE, contentFingerprint: bad }), PARAMS)
    expect(res.status).toBe(409)
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('a lost-reply retry by the same signer still succeeds without a fingerprint', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow({ client_response: 'accepted' })],
      signatureRows: [{ signer_name: 'Jane Doe', signer_email: null }],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)
    const res = await POST(jsonRequest({ ...BASE, contentFingerprint: undefined }), PARAMS)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, alreadySigned: true })
  })
})

describe('public link gate: expiry and share password (same rules as the public page)', () => {
  function configure(rowOverrides: Record<string, unknown> = {}) {
    const supabase = buildSupabase({
      estimateRows: [estimateRow(rowOverrides)],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)
    return supabase
  }
  const BASE = { token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }
  const PAST = '2020-01-01T00:00:00.000Z'
  const FUTURE = '2999-01-01T00:00:00.000Z'

  beforeEach(() => {
    mockCookieGet.mockReturnValue({ value: 'signed-cookie' })
    mockHasValidUnlock.mockReturnValue(false)
  })

  it('an expired link -> 410 link_expired, nothing signed', async () => {
    const supabase = configure({ share_expires_at: PAST })
    const res = await POST(jsonRequest(BASE), PARAMS)
    expect(res.status).toBe(410)
    await expect(res.json()).resolves.toEqual({ error: 'link_expired' })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('a password-protected link without a valid unlock cookie -> 403 link_locked, nothing signed', async () => {
    const supabase = configure({ share_password_hash: 'scrypt$hash', share_expires_at: FUTURE })
    mockCookieGet.mockReturnValue(undefined)
    const res = await POST(jsonRequest(BASE), PARAMS)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'link_locked' })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('a password-protected link with a cookie that does not verify for THIS token -> 403', async () => {
    const supabase = configure({ share_password_hash: 'scrypt$hash' })
    mockHasValidUnlock.mockReturnValue(false)
    const res = await POST(jsonRequest(BASE), PARAMS)
    expect(res.status).toBe(403)
    expect(mockHasValidUnlock).toHaveBeenCalledWith('signed-cookie', 'share-token-abc')
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  it('a password-protected link WITH a valid unlock cookie signs normally', async () => {
    const supabase = configure({ share_password_hash: 'scrypt$hash', share_expires_at: FUTURE })
    mockHasValidUnlock.mockReturnValue(true)
    const res = await POST(jsonRequest(BASE), PARAMS)
    expect(res.status).toBe(200)
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
  })

  it('an unprotected, unexpired link signs without any cookie', async () => {
    const supabase = configure({ share_password_hash: null, share_expires_at: null })
    const res = await POST(jsonRequest(BASE), PARAMS)
    expect(res.status).toBe(200)
    expect(supabase.__rpcMock).toHaveBeenCalledOnce()
    expect(mockHasValidUnlock).not.toHaveBeenCalled()
  })
})

describe('rate limiting (audit finding c)', () => {
  it('denies with 429 + Retry-After when the limiter blocks, without ever calling the RPC', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 11, max: 10, retryAfter: 42 })
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
  })

  // Fix-pack F1 (finding #4): rate limiting now runs before request.json()
  // and before ANY DB query — proves the limiter can deny WITHOUT the route
  // ever touching Supabase at all (previously the body parse + estimates
  // SELECT both ran first, unthrottled).
  it('denies before ever calling requireServiceClient (body parse + estimate lookup never run)', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 11, max: 10, retryAfter: 5 })

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(429)
    expect(mockRequireServiceClient).not.toHaveBeenCalled()
  })

  it('rate-limits keyed on the resolved IP, not the (not-yet-parsed) share token', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    // mockHeaders' default (beforeEach) x-forwarded-for last entry.
    expect(mockRateLimit).toHaveBeenCalledWith('signPerMinute', '203.0.113.9')
  })

  it('falls back to the shared "no-ip" bucket when no forwarded-for header is present at all', async () => {
    mockHeaders.mockReturnValue(new Headers({ 'user-agent': 'vitest' }))
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(mockRateLimit).toHaveBeenCalledWith('signPerMinute', 'no-ip')
  })
})

describe('client IP resolution (audit finding d / fix-pack F1 finding #5)', () => {
  function configureSuccess() {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)
    return supabase
  }

  it('uses the LAST x-forwarded-for entry, never x-real-ip and never the FIRST entry', async () => {
    const supabase = configureSuccess()
    mockHeaders.mockReturnValue(
      new Headers({
        'x-real-ip': '203.0.113.7',
        'x-forwarded-for': '198.51.100.1, 203.0.113.9',
      })
    )

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(200)
    const [, rpcParams] = supabase.__rpcMock.mock.calls[0]
    expect(rpcParams.p_ip_address).toBe('203.0.113.9')
    expect(rpcParams.p_ip_address).not.toBe('203.0.113.7')
    expect(rpcParams.p_ip_address).not.toBe('198.51.100.1')
  })

  it('a garbage/invalid x-forwarded-for value resolves to a null IP rather than reaching the RPC unvalidated', async () => {
    const supabase = configureSuccess()
    mockHeaders.mockReturnValue(new Headers({ 'x-forwarded-for': 'not-an-ip-at-all' }))

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(200)
    const [, rpcParams] = supabase.__rpcMock.mock.calls[0]
    expect(rpcParams.p_ip_address).toBeNull()
  })

  it('no x-forwarded-for header at all resolves to a null IP', async () => {
    const supabase = configureSuccess()
    mockHeaders.mockReturnValue(new Headers({ 'x-real-ip': '203.0.113.7' }))

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )

    expect(res.status).toBe(200)
    const [, rpcParams] = supabase.__rpcMock.mock.calls[0]
    expect(rpcParams.p_ip_address).toBeNull()
  })
})

// Fix-pack F1 (finding #3) — the route must hash the CANONICAL (sorted-key)
// serialization of signed_content, not plain JSON.stringify, so the recorded
// digest is reproducible by re-reading the persisted jsonb value back and
// re-canonicalizing it (jsonb itself discards key-insertion order).
describe('tamper-evidence hash (fix-pack F1 finding #3)', () => {
  it('p_snapshot_sha256 is SHA-256 of canonicalJsonStringify(p_signed_content), reproducible from the stored value alone', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', signerName: 'Jane Doe', signatureData: TINY_PNG_DATA_URL }),
      PARAMS
    )
    expect(res.status).toBe(200)

    const [, rpcParams] = supabase.__rpcMock.mock.calls[0]
    // Simulates a verifier: re-reads the persisted p_signed_content value
    // (as if freshly SELECTed back out of the jsonb column) and re-hashes it
    // with the SAME canonical serializer — no access to route internals.
    const reproducedHash = createHash('sha256')
      .update(canonicalJsonStringify(rpcParams.p_signed_content))
      .digest('hex')
    expect(rpcParams.p_snapshot_sha256).toBe(reproducedHash)

    // Proves this is NOT just plain JSON.stringify under a different name —
    // reordering p_signed_content's own top-level keys must not change the
    // canonical hash a verifier reproduces from it.
    const reorderedContent = Object.fromEntries(
      Object.entries(rpcParams.p_signed_content as Record<string, unknown>).reverse()
    )
    const reorderedHash = createHash('sha256')
      .update(canonicalJsonStringify(reorderedContent))
      .digest('hex')
    expect(reorderedHash).toBe(rpcParams.p_snapshot_sha256)
  })
})

describe('lost-reply retry (idempotent sign)', () => {
  const body = { token: 'share-token-abc', signerName: 'Jane Doe', signerEmail: 'jane@example.com', signatureData: TINY_PNG_DATA_URL }

  it('already accepted by the same signer: 200 success, no RPC, no second notification', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow({ client_response: 'accepted' })],
      signatureRows: [{ signer_name: 'jane doe', signer_email: 'JANE@example.com' }],
      rpcHandler: () => ({ data: RPC_SUCCESS_RESULT, error: null }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(jsonRequest(body), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, alreadySigned: true })
    expect(supabase.__rpcMock).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('already accepted by a different signer: still 409', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow({ client_response: 'accepted' })],
      signatureRows: [{ signer_name: 'Someone Else', signer_email: null }],
      rpcHandler: () => ({ data: null, error: { code: 'P0008' } }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(jsonRequest(body), PARAMS)

    expect(res.status).toBe(409)
  })

  it('the RPC reporting already-responded for the same signer (concurrent duplicate) is also success', async () => {
    const supabase = buildSupabase({
      estimateRows: [estimateRow()],
      signatureRows: [{ signer_name: 'Jane Doe', signer_email: 'jane@example.com' }],
      rpcHandler: () => ({ data: null, error: { code: 'P0008' } }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(jsonRequest(body), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, alreadySigned: true })
  })
})
