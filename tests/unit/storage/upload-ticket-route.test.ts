import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 189 Plan 02 — UPLOAD-02: contract coverage for
 * `POST /api/storage/upload-ticket` (app/api/storage/upload-ticket/route.ts).
 *
 * Every refusal is asserted on TWO axes: the returned status, and that the
 * later gates provably never ran (mint not called; for the demo gate, the
 * project lookup itself never ran either). This is what makes the test worth
 * more than "the status code matches" — a route that returns the right
 * status but still leaks a DB read or a mint call on a refusal path is a
 * live vulnerability this suite is built to catch.
 *
 * `@/lib/storage/upload-ticket` is mocked WHOLESALE (not `importActual`) so
 * this suite never pulls in `lib/storage/server.ts`'s `assertServer()`
 * (throws under jsdom's `window`) — the mock reimplements just enough of
 * `normalizeUploadContentType`'s allowlist behavior to exercise the route's
 * own gate 1 shape checks realistically.
 */

vi.mock('@/lib/storage/upload-ticket', () => {
  const ALLOWED = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav'])
  return {
    UPLOAD_TICKET_BUCKETS: ['audio'],
    normalizeUploadContentType: (raw: unknown): string | null => {
      if (typeof raw !== 'string' || raw.length === 0) return null
      if (/[\r\n]/.test(raw)) return null
      const base = raw.trim().toLowerCase().split(';')[0]?.trim() ?? ''
      return ALLOWED.has(base) ? base : null
    },
    mintUploadTicket: vi.fn(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: vi.fn(),
}))

import { POST } from '@/app/api/storage/upload-ticket/route'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { demoGuardResponse } from '@/lib/demo/guard'
import { mintUploadTicket } from '@/lib/storage/upload-ticket'
import { NextResponse } from 'next/server'

const mockCreateClient = vi.mocked(createClient)
const mockGetActiveCompanyId = vi.mocked(getActiveCompanyId)
const mockDemoGuardResponse = vi.mocked(demoGuardResponse)
const mockMintUploadTicket = vi.mocked(mintUploadTicket)

const COMPANY_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-2222-2222-222222222222'
const PROJECT_ID = '33333333-3333-3333-3333-333333333333'
const CLAIMS = { sub: 'user-1' }

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/storage/upload-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function makeSupabaseMock(opts: { claims?: object | null; projectRow?: { id: string } | null } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: opts.projectRow ?? null, error: null })
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  const from = vi.fn().mockReturnValue({ select })

  return {
    client: {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: opts.claims === undefined ? CLAIMS : opts.claims },
        }),
      },
      from,
    },
    from,
    select,
    eq1,
    eq2,
    maybeSingle,
  }
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    bucket: 'audio',
    projectId: PROJECT_ID,
    contentType: 'audio/webm;codecs=opus',
    ...overrides,
  }
}

const SAMPLE_TICKET = {
  strategy: 's3-presigned-put' as const,
  bucket: 'audio',
  key: `${COMPANY_ID}/${PROJECT_ID}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webm`,
  url: 'https://fake-r2-endpoint/signed',
  headers: { 'Content-Type': 'audio/webm' },
  expiresInSeconds: 900,
  contentType: 'audio/webm',
}

describe('POST /api/storage/upload-ticket', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetActiveCompanyId.mockResolvedValue(COMPANY_ID)
    mockDemoGuardResponse.mockResolvedValue(null)
    mockMintUploadTicket.mockResolvedValue(SAMPLE_TICKET)
  })

  it('unauthenticated -> 401, mintUploadTicket not called, createClient never reached for later gates', async () => {
    const supa = makeSupabaseMock({ claims: null })
    mockCreateClient.mockResolvedValue(supa.client as never)

    const res = await POST(makeRequest(validBody()))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Not authenticated')
    expect(mockMintUploadTicket).not.toHaveBeenCalled()
    expect(mockDemoGuardResponse).not.toHaveBeenCalled()
    expect(supa.from).not.toHaveBeenCalled()
  })

  it('authenticated, no active company -> 401, mint not called', async () => {
    const supa = makeSupabaseMock()
    mockCreateClient.mockResolvedValue(supa.client as never)
    mockGetActiveCompanyId.mockResolvedValue(null)

    const res = await POST(makeRequest(validBody()))

    expect(res.status).toBe(401)
    expect(mockMintUploadTicket).not.toHaveBeenCalled()
    expect(mockDemoGuardResponse).not.toHaveBeenCalled()
  })

  it('demo principal -> 403 demo_readonly, mint not called, and the project lookup was never performed', async () => {
    const supa = makeSupabaseMock({ projectRow: { id: PROJECT_ID } })
    mockCreateClient.mockResolvedValue(supa.client as never)
    mockDemoGuardResponse.mockResolvedValue(
      NextResponse.json({ error: 'demo_readonly', message: 'read-only demo' }, { status: 403 }),
    )

    const res = await POST(makeRequest(validBody()))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('demo_readonly')
    expect(mockMintUploadTicket).not.toHaveBeenCalled()
    // Call-order proof, not just the status: the project lookup (supabase.from)
    // must never have run once the demo guard refused.
    expect(supa.from).not.toHaveBeenCalled()
  })

  it('demo refusal still carries Cache-Control: private, no-store', async () => {
    const supa = makeSupabaseMock()
    mockCreateClient.mockResolvedValue(supa.client as never)
    mockDemoGuardResponse.mockResolvedValue(
      NextResponse.json({ error: 'demo_readonly', message: 'read-only demo' }, { status: 403 }),
    )

    const res = await POST(makeRequest(validBody()))

    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('projectId belonging to another company -> 404, mint not called', async () => {
    const supa = makeSupabaseMock({ projectRow: null })
    mockCreateClient.mockResolvedValue(supa.client as never)

    const res = await POST(makeRequest(validBody()))

    expect(res.status).toBe(404)
    expect(mockMintUploadTicket).not.toHaveBeenCalled()
    // The ownership query must scope on both projectId AND the auth-derived
    // companyId — never projectId alone.
    expect(supa.select).toHaveBeenCalledWith('id')
    expect(supa.eq1).toHaveBeenCalledWith('id', PROJECT_ID)
    expect(supa.eq2).toHaveBeenCalledWith('company_id', COMPANY_ID)
  })

  it("bucket: 'photos' -> 400, mint not called, no auth work performed", async () => {
    const supa = makeSupabaseMock()
    mockCreateClient.mockResolvedValue(supa.client as never)

    const res = await POST(makeRequest(validBody({ bucket: 'photos' })))

    expect(res.status).toBe(400)
    expect(mockMintUploadTicket).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("contentType: 'text/html' -> 400, mint never reaches a backend", async () => {
    const supa = makeSupabaseMock()
    mockCreateClient.mockResolvedValue(supa.client as never)

    const res = await POST(makeRequest(validBody({ contentType: 'text/html' })))

    expect(res.status).toBe(400)
    expect(mockMintUploadTicket).not.toHaveBeenCalled()
  })

  it('non-UUID projectId -> 400, mint not called', async () => {
    const res = await POST(makeRequest(validBody({ projectId: 'not-a-uuid' })))

    expect(res.status).toBe(400)
    expect(mockMintUploadTicket).not.toHaveBeenCalled()
  })

  it('missing/non-JSON body -> 400, mint not called', async () => {
    const req = new Request('http://localhost/api/storage/upload-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json {{{',
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(mockMintUploadTicket).not.toHaveBeenCalled()
  })

  it("body { companyId: '<other-tenant-uuid>' } is ignored — mintUploadTicket receives the auth-derived company, not the body's", async () => {
    const supa = makeSupabaseMock({ projectRow: { id: PROJECT_ID } })
    mockCreateClient.mockResolvedValue(supa.client as never)

    const res = await POST(makeRequest(validBody({ companyId: OTHER_COMPANY_ID })))

    expect(res.status).toBe(200)
    expect(mockMintUploadTicket).toHaveBeenCalledOnce()
    const args = mockMintUploadTicket.mock.calls[0][0]
    expect(args.companyId).toBe(COMPANY_ID)
    expect(args.companyId).not.toBe(OTHER_COMPANY_ID)
  })

  it('happy path -> 200 with the exact ticket object mintUploadTicket returned, Cache-Control: private, no-store', async () => {
    const supa = makeSupabaseMock({ projectRow: { id: PROJECT_ID } })
    mockCreateClient.mockResolvedValue(supa.client as never)

    const res = await POST(makeRequest(validBody()))

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body).toEqual(SAMPLE_TICKET)
  })

  it('retry path: body carries a prior key -> passed through to mintUploadTicket unchanged', async () => {
    const supa = makeSupabaseMock({ projectRow: { id: PROJECT_ID } })
    mockCreateClient.mockResolvedValue(supa.client as never)
    const priorKey = `${COMPANY_ID}/${PROJECT_ID}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webm`

    const res = await POST(makeRequest(validBody({ key: priorKey })))

    expect(res.status).toBe(200)
    expect(mockMintUploadTicket).toHaveBeenCalledOnce()
    const args = mockMintUploadTicket.mock.calls[0][0]
    expect(args.key).toBe(priorKey)
  })

  it('mintUploadTicket throwing -> 500 with a fixed message, real error never echoed', async () => {
    const supa = makeSupabaseMock({ projectRow: { id: PROJECT_ID } })
    mockCreateClient.mockResolvedValue(supa.client as never)
    mockMintUploadTicket.mockRejectedValue(
      new Error('S3 endpoint https://secret-account.r2.cloudflarestorage.com unreachable'),
    )
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeRequest(validBody()))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Could not issue upload ticket')
    expect(JSON.stringify(body)).not.toMatch(/r2\.cloudflarestorage\.com/)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('normalizes contentType before passing it to mintUploadTicket', async () => {
    const supa = makeSupabaseMock({ projectRow: { id: PROJECT_ID } })
    mockCreateClient.mockResolvedValue(supa.client as never)

    await POST(makeRequest(validBody({ contentType: 'AUDIO/WEBM;codecs=opus' })))

    expect(mockMintUploadTicket).toHaveBeenCalledOnce()
    const args = mockMintUploadTicket.mock.calls[0][0]
    expect(args.contentType).toBe('audio/webm')
  })
})
