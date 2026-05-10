import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn(),
}))

import { GET } from '@/app/api/cron/cleanup-whatsapp-sessions/route'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'

const mockSend = vi.mocked(sendWhatsAppMessage)
const mockServiceClient = vi.mocked(requireServiceClient)

function makeRequest(authHeader?: string) {
  return new Request('http://localhost/api/cron/cleanup-whatsapp-sessions', {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

function makeSupabase(expiredSessions: Array<{ id: string; phone_number: string; draft_project_id: string | null }>) {
  const deleteSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          lt: vi.fn().mockResolvedValue({ data: expiredSessions, error: null }),
        }),
      }),
      delete: deleteSpy,
    }),
    deleteSpy,
  }
}

describe('GET /api/cron/cleanup-whatsapp-sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    mockSend.mockResolvedValue(undefined)
  })

  it('returns 401 when authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 when authorization header is wrong', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(503)
  })

  it('returns cleaned: 0 when no expired sessions exist', async () => {
    const { from, deleteSpy } = makeSupabase([])
    mockServiceClient.mockReturnValue({ from } as never)

    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cleaned).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('sends expiry notification and deletes each expired session', async () => {
    const expiredSessions = [
      { id: 'session-1', phone_number: '+15551111111', draft_project_id: 'project-1' },
      { id: 'session-2', phone_number: '+15552222222', draft_project_id: null },
    ]
    const { from, deleteSpy } = makeSupabase(expiredSessions)
    mockServiceClient.mockReturnValue({ from } as never)

    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cleaned).toBe(2)

    // Expiry notification sent to each owner
    expect(mockSend).toHaveBeenCalledTimes(2)
    const phones = mockSend.mock.calls.map(([to]) => to)
    expect(phones).toContain('+15551111111')
    expect(phones).toContain('+15552222222')

    // Sessions deleted
    expect(deleteSpy).toHaveBeenCalledTimes(2)
  })

  it('still deletes session even when sendWhatsAppMessage fails', async () => {
    const expiredSessions = [
      { id: 'session-1', phone_number: '+15551111111', draft_project_id: null },
    ]
    const { from, deleteSpy } = makeSupabase(expiredSessions)
    mockServiceClient.mockReturnValue({ from } as never)
    mockSend.mockRejectedValue(new Error('WhatsApp API down'))

    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)
    expect(deleteSpy).toHaveBeenCalledOnce()
  })
})
