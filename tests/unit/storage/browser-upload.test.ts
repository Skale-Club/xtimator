/**
 * Phase 189 Plan 03 — UPLOAD-01/UPLOAD-04: browser-upload.ts unit tests.
 *
 * Covers retry-parity with `uploadWithRetry` (composed unmodified), the
 * single-ticket-mint-outside-the-retry-loop rule, blob content-type
 * stamping for both ticket strategies, and `requestUploadTicket`'s own
 * bounded retry ladder for the ticket-mint POST itself.
 *
 * Mocking follows tests/unit/estimate/poll-outcome.test.ts's convention:
 * module-level vi.mock + vi.mocked for the cross-layer `@/lib/supabase/client`
 * import. `global.fetch` is mocked directly per test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/client'
import { uploadViaTicket, requestUploadTicket } from '@/lib/storage/browser-upload'
import type { UploadTicket } from '@/lib/storage/upload-ticket-types'

const mockCreateClient = vi.mocked(createClient)

const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const TICKET_ROUTE = '/api/storage/upload-ticket'

const s3Ticket: UploadTicket = {
  strategy: 's3-presigned-put',
  bucket: 'audio',
  key: 'company-1/project-1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webm',
  url: 'https://r2.example.com/audio/company-1/project-1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webm?X-Amz-Signature=abc',
  headers: { 'Content-Type': 'audio/webm' },
  expiresInSeconds: 900,
  contentType: 'audio/webm',
}

const supabaseTicket: UploadTicket = {
  strategy: 'supabase-signed-upload',
  bucket: 'audio',
  key: 'company-1/project-1/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webm',
  token: 'signed-upload-token',
  expiresInSeconds: 900,
  contentType: 'audio/webm',
}

/** A fetch Response stand-in that supports `.ok`/`.status`/`.statusText`/`.json()`. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  }
}

/** A fetch Response stand-in with no body — used for the PUT calls, which
 * never read `.json()` on failure (only `.status`/`.statusText`). */
function plainResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => ({}),
  }
}

function installFetchMock(...responses: Array<ReturnType<typeof jsonResponse>>) {
  const fetchMock = vi.fn()
  for (const r of responses) fetchMock.mockResolvedValueOnce(r)
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function ticketPostCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((c) => c[0] === TICKET_ROUTE)
}

function putCalls(fetchMock: ReturnType<typeof vi.fn>, url: string) {
  return fetchMock.mock.calls.filter((c) => c[0] === url)
}

describe('browser-upload (UPLOAD-01/UPLOAD-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('happy path, s3 strategy: exactly one ticket POST, one PUT, resolved path === ticket key, PUT headers deep-equal ticket.headers', async () => {
    const fetchMock = installFetchMock(jsonResponse(200, s3Ticket), plainResponse(200))
    const blob = new Blob(['x'], { type: 'audio/webm' })

    const result = await uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' })

    expect(result).toEqual({ path: s3Ticket.key })
    expect(ticketPostCalls(fetchMock)).toHaveLength(1)
    expect(putCalls(fetchMock, s3Ticket.url)).toHaveLength(1)
    const putCall = putCalls(fetchMock, s3Ticket.url)[0]
    expect(putCall[1].headers).toEqual(s3Ticket.headers)
    expect(putCall[1].method).toBe('PUT')
  })

  it('happy path, supabase strategy: uploadToSignedUrl called with (key, token, blob, { upsert: false })', async () => {
    const uploadToSignedUrl = vi.fn().mockResolvedValue({ data: { path: supabaseTicket.key }, error: null })
    mockCreateClient.mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ uploadToSignedUrl }) },
    } as unknown as ReturnType<typeof createClient>)
    const fetchMock = installFetchMock(jsonResponse(200, supabaseTicket))
    const blob = new Blob(['x'], { type: 'audio/webm' })

    const result = await uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' })

    expect(result).toEqual({ path: supabaseTicket.key })
    expect(ticketPostCalls(fetchMock)).toHaveLength(1)
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1)
    const [key, token, body, opts] = uploadToSignedUrl.mock.calls[0]
    expect(key).toBe(supabaseTicket.key)
    expect(token).toBe(supabaseTicket.token)
    expect(opts).toEqual({ upsert: false })
    expect(body).toBeInstanceOf(Blob)
  })

  it('blob stamping: a Blob with type "" is uploaded with type === ticket.contentType', async () => {
    const fetchMock = installFetchMock(jsonResponse(200, s3Ticket), plainResponse(200))
    const blob = new Blob(['x'], { type: '' })

    await uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' })

    const putCall = putCalls(fetchMock, s3Ticket.url)[0]
    const sentBody = putCall[1].body as Blob
    expect(sentBody.type).toBe(s3Ticket.contentType)
    expect(sentBody).not.toBe(blob)
  })

  it('blob stamping: a blob already matching ticket.contentType is passed through untouched (identity check)', async () => {
    const fetchMock = installFetchMock(jsonResponse(200, s3Ticket), plainResponse(200))
    const blob = new Blob(['x'], { type: s3Ticket.contentType })

    await uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' })

    const putCall = putCalls(fetchMock, s3Ticket.url)[0]
    expect(putCall[1].body).toBe(blob)
  })

  it('transient: PUT fails 503 twice then 200 -> resolves, and exactly one ticket POST was made (key not re-minted per attempt)', async () => {
    const fetchMock = installFetchMock(
      jsonResponse(200, s3Ticket),
      plainResponse(503),
      plainResponse(503),
      plainResponse(200),
    )
    const blob = new Blob(['x'], { type: 'audio/webm' })

    const promise = uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' })
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)

    const result = await promise
    expect(result).toEqual({ path: s3Ticket.key })
    expect(ticketPostCalls(fetchMock)).toHaveLength(1)
    const puts = putCalls(fetchMock, s3Ticket.url)
    expect(puts).toHaveLength(3)
  })

  it('retry key identity: across a transient failure, every PUT used the same URL and key', async () => {
    const fetchMock = installFetchMock(
      jsonResponse(200, s3Ticket),
      plainResponse(503),
      plainResponse(200),
    )
    const blob = new Blob(['x'], { type: 'audio/webm' })

    const promise = uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' })
    await vi.advanceTimersByTimeAsync(1000)
    await promise

    const puts = putCalls(fetchMock, s3Ticket.url)
    expect(puts).toHaveLength(2)
    for (const call of puts) {
      expect(call[0]).toBe(s3Ticket.url)
    }
  })

  it('terminal: PUT returns 403 -> rejects after one PUT attempt', async () => {
    const fetchMock = installFetchMock(jsonResponse(200, s3Ticket), plainResponse(403))
    const blob = new Blob(['x'], { type: 'audio/webm' })

    await expect(
      uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' }),
    ).rejects.toThrow()

    expect(putCalls(fetchMock, s3Ticket.url)).toHaveLength(1)
  })

  it('409 on PUT -> resolves successfully (idempotent re-upload rule, reached unchanged through this module)', async () => {
    const fetchMock = installFetchMock(jsonResponse(200, s3Ticket), plainResponse(409))
    const blob = new Blob(['x'], { type: 'audio/webm' })

    const result = await uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' })

    expect(result).toEqual({ path: s3Ticket.key })
    expect(putCalls(fetchMock, s3Ticket.url)).toHaveLength(1)
  })

  it('ticket POST returns 500 twice then 200 -> resolves, 3 POSTs total', async () => {
    const fetchMock = installFetchMock(
      jsonResponse(500, { error: 'boom' }),
      jsonResponse(500, { error: 'boom' }),
      jsonResponse(200, s3Ticket),
      plainResponse(200),
    )
    const blob = new Blob(['x'], { type: 'audio/webm' })

    const promise = uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' })
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)

    const result = await promise
    expect(result).toEqual({ path: s3Ticket.key })
    expect(ticketPostCalls(fetchMock)).toHaveLength(3)
  })

  it('ticket POST returns 401 -> rejects immediately, no PUT attempted', async () => {
    const fetchMock = installFetchMock(jsonResponse(401, { error: 'Not authenticated' }))
    const blob = new Blob(['x'], { type: 'audio/webm' })

    await expect(
      uploadViaTicket({ bucket: 'audio', projectId: PROJECT_ID, blob, contentType: 'audio/webm' }),
    ).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('abort mid-backoff -> rejects AbortError, no further fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' }))
    global.fetch = fetchMock as unknown as typeof fetch
    const controller = new AbortController()

    const promise = requestUploadTicket(
      { bucket: 'audio', projectId: PROJECT_ID, contentType: 'audio/webm' },
      { signal: controller.signal },
    )
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    controller.abort()
    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
