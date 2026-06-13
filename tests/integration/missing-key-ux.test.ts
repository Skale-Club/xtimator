/**
 * Integration test (ADMIN-11): "feature not configured → 503 with friendly body".
 *
 * The /api/estimates/[id]/send route checks for a Resend API key and, when
 * absent, returns 503 with a body containing "isn't configured" / "not
 * configured" so the tenant UI can surface a friendly explanation.
 *
 * Strategy (test-handler simplification): rather than spinning up the full
 * route + DB seed for an estimate (heavy, brittle, requires fixtures across
 * three tables), we mock the route's collaborators so the handler short-
 * circuits at the Resend-not-configured branch and returns the 503 we want
 * to assert against. This proves the contract: if RESEND_API_KEY is unset
 * AND no platform_integrations row exists for 'resend', the handler responds
 * 503 with a body that matches /not configured/i.
 *
 * If the project later wires this route to use getIntegrationKey() instead of
 * direct process.env (Plan 08-08 sweep), this test should be updated to mock
 * @/lib/platform-config.getIntegrationKey → null.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: 'test-user', email: 'tester@example.com' } },
      }),
    },
    from: vi.fn(),
  })),
}))

vi.mock('@/lib/queries/estimate', () => ({
  getEstimateWithContext: vi.fn().mockResolvedValue({
    estimate: { id: 'e1', project_id: 'p1', company_id: 'c1', workflow_status: 'consolidated' },
    project: { name: 'Test', project_type: null, client: null },
    company: { id: 'c1', name: 'Acme' },
  }),
}))

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue(null),
  invalidatePlatformConfig: vi.fn(),
}))

// Mock react-pdf renderer + EstimatePDF so we don't pull in the renderer chain.
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(),
}))

vi.mock('@/components/pdf/estimate-pdf', () => ({
  default: () => null,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('estimate /send route returns 503 with friendly body when Resend not configured (ADMIN-11)', () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('responds 503 with /not configured/i in the body', async () => {
    const { POST } = await import('@/app/api/estimates/[id]/send/route')

    const request = new Request('http://localhost/api/estimates/test-id/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: 'client@example.com',
        subject: 'Estimate',
        body: 'Hello',
        attachPdf: false,
      }),
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: 'test-id' }),
    })

    expect(response.status).toBe(503)
    const json = (await response.json()) as { error?: string }
    expect(json.error).toBeDefined()
    expect(json.error).toMatch(/not available|not configured|isn't available/i)
  })
})
