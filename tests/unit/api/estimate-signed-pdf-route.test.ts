import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireServiceClient: vi.fn(),
  readClientIp: vi.fn(),
  checkShareAccess: vi.fn(),
  rateLimit: vi.fn(),
  resolveContext: vi.fn(),
  renderPdf: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: mocks.requireServiceClient }))
vi.mock('@/lib/estimates/public-access', () => ({
  readClientIp: mocks.readClientIp,
  checkShareAccess: mocks.checkShareAccess,
}))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/pdf/render-estimate-pdf', () => ({
  resolveEstimatePdfContext: mocks.resolveContext,
  renderEstimatePdf: mocks.renderPdf,
}))

import { GET } from '@/app/api/estimates/[id]/pdf/route'

const id = '00000000-0000-4000-8000-000000000001'
const token = '00000000-0000-4000-8000-000000000002'
const estimate = {
  share_token: token,
  share_password_hash: 'stored-password-hash',
  share_expires_at: '2027-01-01T00:00:00Z',
  client_response: 'accepted',
}
const context = {
  estimate,
  signature: { signerName: 'Test signer' },
  hasSignedSnapshot: true,
  signatureEvidence: { integrity: 'verified', consentStatement: 'I approve the estimate.' },
  templateId: 'classic',
  contentKey: 'signed-version',
  estimateLanguage: 'en',
}
const query = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const service = { from: vi.fn().mockReturnValue(query) }
const owner = { auth: { getClaims: vi.fn() } }

function call(query = `?token=${token}`, headers?: HeadersInit) {
  return GET(new Request(`http://localhost/api/estimates/${id}/pdf${query}`, { headers }), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue(owner)
  mocks.requireServiceClient.mockReturnValue(service)
  mocks.readClientIp.mockResolvedValue('198.51.100.10')
  mocks.checkShareAccess.mockResolvedValue('ok')
  mocks.rateLimit.mockResolvedValue({ allowed: true })
  query.maybeSingle.mockResolvedValue({ data: estimate })
  mocks.resolveContext.mockResolvedValue(context)
  mocks.renderPdf.mockResolvedValue({ buffer: Buffer.from('%PDF'), projectName: 'New deck' })
  owner.auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'owner' } } })
})

describe('public signed estimate PDF', () => {
  it('throttles requests before reading the database using an IP and token hash', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, retryAfter: 42 })

    const response = await call()

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('42')
    expect(mocks.rateLimit).toHaveBeenNthCalledWith(1, 'ipPerMinute', 'signed-estimate-pdf:198.51.100.10')
    expect(mocks.rateLimit).toHaveBeenNthCalledWith(
      2, 'publicEstimateResponsePerMinute', expect.stringMatching(/^pdf:198\.51\.100\.10:[a-f0-9]{16}$/),
    )
    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
  })

  it('looks up the estimate by both ID and token and refuses an unknown match', async () => {
    query.maybeSingle.mockResolvedValue({ data: null })

    expect((await call()).status).toBe(404)
    expect(query.eq).toHaveBeenCalledWith('id', id)
    expect(query.eq).toHaveBeenCalledWith('share_token', token)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.resolveContext).not.toHaveBeenCalled()
  })

  it.each([['locked', 403], ['expired', 410]])('refuses a %s share link before loading document data', async (access, status) => {
    mocks.checkShareAccess.mockResolvedValue(access)

    expect((await call()).status).toBe(status)
    expect(mocks.checkShareAccess).toHaveBeenCalledWith(estimate, token)
    expect(mocks.resolveContext).not.toHaveBeenCalled()
  })

  it('refuses an unaccepted estimate and an accepted estimate without a usable snapshot', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: { ...estimate, client_response: null } })
    expect((await call()).status).toBe(404)
    expect(mocks.resolveContext).not.toHaveBeenCalled()

    mocks.resolveContext.mockResolvedValueOnce({ ...context, signatureEvidence: null })
    expect((await call()).status).toBe(404)

    mocks.resolveContext.mockResolvedValueOnce({ ...context, signatureEvidence: { integrity: 'mismatch' } })
    expect((await call()).status).toBe(404)

    mocks.resolveContext.mockResolvedValueOnce({ ...context, hasSignedSnapshot: false })
    expect((await call()).status).toBe(404)
    expect(mocks.renderPdf).not.toHaveBeenCalled()
  })

  it('serves a historical signed snapshot when the stored hash is unavailable', async () => {
    mocks.resolveContext.mockResolvedValue({ ...context, signatureEvidence: { integrity: 'unavailable' } })

    expect((await call()).status).toBe(200)
  })

  it('refuses access if the share password rotates during context resolution', async () => {
    mocks.resolveContext.mockResolvedValue({ ...context, estimate: { ...estimate, share_password_hash: 'new' } })

    expect((await call()).status).toBe(404)
    expect(mocks.renderPdf).not.toHaveBeenCalled()
  })

  it('downloads an uncached signed PDF without an owner session', async () => {
    const response = await call(undefined, { 'If-None-Match': '"signed-version-classic-en"' })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toContain('attachment')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.has('ETag')).toBe(false)
    expect(await response.text()).toBe('%PDF')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.renderPdf).toHaveBeenCalledWith(id, service, { context })
  })
})

describe('owner estimate PDF', () => {
  it('keeps the authenticated ETag short circuit', async () => {
    const response = await call('', { 'If-None-Match': '"signed-version-classic-en"' })

    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe('"signed-version-classic-en"')
    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
    expect(mocks.renderPdf).not.toHaveBeenCalled()
  })

  it('requires authentication when no token is supplied', async () => {
    owner.auth.getClaims.mockResolvedValue({ data: null })

    expect((await call('')).status).toBe(401)
    expect(mocks.resolveContext).not.toHaveBeenCalled()
  })
})
