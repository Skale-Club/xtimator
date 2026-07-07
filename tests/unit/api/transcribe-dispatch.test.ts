import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing v2: the credit gate now runs on every request — stub it permissive so
// these tests stay focused on their own contract (the gate has its own tests).
vi.mock('@/lib/billing/credit-ledger', () => ({
  // plain async fn (not vi.fn) so global mock resets can never strip the value
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
}))

/**
 * INNGEST-03: POST /api/transcribe dispatches Whisper via Inngest (Wave 1 GREEN).
 *
 * Plan 67-03 created app/api/transcribe/route.ts. Contract:
 *   - POST accepts { recordingId } and returns { jobId } HTTP 202 in <1s
 *   - calls inngest.send() with name 'audio/transcribe.requested'
 *     and event id 'transcribe-{recordingId}' (recordingId is naturally unique)
 *   - does NOT call OpenAI Whisper directly
 *   - 401 when not authenticated
 *   - 404 (not_found) when recording missing
 *   - 400 (bad_request) when storage_path is null (text-only recording)
 *   - 403 (forbidden) when recording belongs to a different company
 */

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Pre-launch audit fix (M-3): the route resolves the caller's company via
// getActiveCompanyId() (company_members-based, works for staff) instead of
// the old companies.user_id = claims.sub lookup.
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

import { POST } from '@/app/api/transcribe/route'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'
import { getActiveCompanyId } from '@/lib/queries/active-company'

const mockSend = vi.mocked(inngest.send)
const mockGetActiveCompanyId = vi.mocked(getActiveCompanyId)

function makeRequest(recordingId?: string) {
  return new Request('http://localhost/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recordingId ? { recordingId } : {}),
  })
}

interface SbOpts {
  unauth?: boolean
  recordingExists?: boolean
  recordingHasAudio?: boolean
  recordingCompanyId?: string
  callerCompanyId?: string | null
}

function makeSupabaseMock(opts: SbOpts = {}) {
  const {
    unauth = false,
    recordingExists = true,
    recordingHasAudio = true,
    recordingCompanyId = 'company-1',
    callerCompanyId = 'company-1',
  } = opts

  mockGetActiveCompanyId.mockResolvedValue(callerCompanyId ?? null)

  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: unauth ? null : { sub: 'user-1' } },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'recordings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: recordingExists
                  ? {
                      id: 'rec-1',
                      storage_path: recordingHasAudio
                        ? 'company-1/proj-1/rec.webm'
                        : null,
                      company_id: recordingCompanyId,
                    }
                  : null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: callerCompanyId ? { id: callerCompanyId } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

describe('INNGEST-03: POST /api/transcribe dispatch', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSend.mockResolvedValue({ ids: ['evt_transcribe_abc'] } as never)
    mockFetch.mockReset()
  })

  it('accepts { recordingId } and returns { jobId } HTTP 202 in <1s', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const start = Date.now()
    const res = await POST(makeRequest('rec-1'))
    const elapsed = Date.now() - start

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body).toEqual({ jobId: 'evt_transcribe_abc' })
    expect(elapsed).toBeLessThan(1000)
  })

  it('calls inngest.send() with name "audio/transcribe.requested" and event id "transcribe-{recordingId}"', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    await POST(makeRequest('rec-1'))

    expect(mockSend).toHaveBeenCalledOnce()
    const payload = mockSend.mock.calls[0][0] as {
      name: string
      id: string
      data: { companyId: string; recordingId: string; storagePath: string }
    }
    expect(payload.name).toBe('audio/transcribe.requested')
    expect(payload.id).toBe('transcribe-rec-1')
    expect(payload.data.companyId).toBe('company-1')
    expect(payload.data.recordingId).toBe('rec-1')
    expect(payload.data.storagePath).toBe('company-1/proj-1/rec.webm')
  })

  it('does NOT call OpenAI Whisper directly (no fetch to api.openai.com)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    await POST(makeRequest('rec-1'))

    const calledOpenAI = mockFetch.mock.calls.some((call) =>
      String(call[0]).includes('api.openai.com')
    )
    expect(calledOpenAI).toBe(false)
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ unauth: true }) as never
    )

    const res = await POST(makeRequest('rec-1'))

    expect(res.status).toBe(401)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 404 when recording does not exist', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ recordingExists: false }) as never
    )

    const res = await POST(makeRequest('rec-missing'))

    expect(res.status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 400 when recording has no storage_path (text-only recording)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ recordingHasAudio: false }) as never
    )

    const res = await POST(makeRequest('rec-text'))

    expect(res.status).toBe(400)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 403 when recording belongs to a different company', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({
        recordingCompanyId: 'company-2',
        callerCompanyId: 'company-1',
      }) as never
    )

    const res = await POST(makeRequest('rec-1'))

    expect(res.status).toBe(403)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
