import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 179-02 (TMPLCOMP-02/03/04) — TDD coverage for the thin typed wrapper
 * around Meta Graph API's message-template management endpoints.
 *
 * Mocks `global.fetch` per test (mirrors tests/unit/ai/openrouter-timeout.test.ts's
 * `global.fetch = vi.fn() as unknown as typeof fetch` convention) — this module
 * only calls the global `fetch`, no `vi.mock` module needed.
 */

import {
  buildCreatePayload,
  createMetaTemplate,
  getMetaTemplateStatus,
  updateMetaTemplate,
  extractRejectionReason,
  mapMetaEventToStatus,
  type CreateTemplatePayloadInput,
} from '@/lib/whatsapp/meta-templates-client'

function makeBodyComponent(): CreateTemplatePayloadInput['bodyComponent'] {
  return {
    type: 'BODY',
    text: 'Hi {{1}}, your estimate "{{2}}" has been updated.',
    example: { body_text: [['John Smith', 'Kitchen remodel']] },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn() as unknown as typeof fetch
})

describe('buildCreatePayload', () => {
  it('defaults category=UTILITY, parameter_format=positional, allow_category_change=false (fail-closed)', () => {
    const bodyComponent = makeBodyComponent()
    const payload = buildCreatePayload({
      name: 'owner_estimate_update',
      languageCode: 'en_US',
      bodyComponent,
    })
    expect(payload).toEqual({
      name: 'owner_estimate_update',
      category: 'UTILITY',
      language: 'en_US',
      parameter_format: 'positional',
      allow_category_change: false,
      components: [bodyComponent],
    })
  })

  it('honors an explicit allowCategoryChange: true override', () => {
    const bodyComponent = makeBodyComponent()
    const payload = buildCreatePayload({
      name: 'owner_estimate_update',
      languageCode: 'en_US',
      bodyComponent,
      allowCategoryChange: true,
    })
    expect(payload.allow_category_change).toBe(true)
  })
})

describe('createMetaTemplate', () => {
  const fetchMock = () => global.fetch as ReturnType<typeof vi.fn>

  it('POSTs to {wabaId}/message_templates and returns { ok: true, id } on 200', async () => {
    fetchMock().mockResolvedValueOnce(new Response(JSON.stringify({ id: '123' }), { status: 200 }))

    const payload = buildCreatePayload({
      name: 'owner_estimate_update',
      languageCode: 'en_US',
      bodyComponent: makeBodyComponent(),
    })
    const result = await createMetaTemplate('waba-1', 'token-abc', payload)

    expect(result).toEqual({ ok: true, id: '123' })
    expect(fetchMock()).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock().mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/waba-1\/message_templates$/)
    expect(opts.method).toBe('POST')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
    expect(JSON.parse(opts.body as string)).toEqual(payload)
  })

  it('returns { ok: false, status, error } on a non-200 response, never throws', async () => {
    fetchMock().mockResolvedValueOnce(new Response('bad request body', { status: 400 }))

    const result = await createMetaTemplate(
      'waba-1',
      'token-abc',
      buildCreatePayload({ name: 'x', languageCode: 'en_US', bodyComponent: makeBodyComponent() })
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toBe('bad request body')
    }
  })

  it('returns { ok: false } when the 200 response body is missing id (malformed success)', async () => {
    fetchMock().mockResolvedValueOnce(new Response(JSON.stringify({ status: 'PENDING' }), { status: 200 }))

    const result = await createMetaTemplate(
      'waba-1',
      'token-abc',
      buildCreatePayload({ name: 'x', languageCode: 'en_US', bodyComponent: makeBodyComponent() })
    )

    expect(result.ok).toBe(false)
  })

  it('never throws when fetch itself rejects (network error)', async () => {
    fetchMock().mockRejectedValueOnce(new Error('network down'))

    const result = await createMetaTemplate(
      'waba-1',
      'token-abc',
      buildCreatePayload({ name: 'x', languageCode: 'en_US', bodyComponent: makeBodyComponent() })
    )

    expect(result.ok).toBe(false)
  })
})

describe('getMetaTemplateStatus', () => {
  const fetchMock = () => global.fetch as ReturnType<typeof vi.fn>

  it('returns status + qualityScore + null rejectionReason on a clean 200', async () => {
    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'APPROVED', quality_score: { score: 'GREEN' } }), { status: 200 })
    )

    const result = await getMetaTemplateStatus('tpl-1', 'token-abc')

    expect(result).toEqual({
      ok: true,
      result: { status: 'APPROVED', qualityScore: 'GREEN', rejectionReason: null },
    })
  })

  it('reads rejected_reason when present', async () => {
    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' }), { status: 200 })
    )

    const result = await getMetaTemplateStatus('tpl-1', 'token-abc')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.result.rejectionReason).toBe('INVALID_FORMAT')
  })

  it('falls back to rejection_reason (the OTHER possible field name) when rejected_reason is absent', async () => {
    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'REJECTED', rejection_reason: 'TAG_CONTENT_MISMATCH' }), { status: 200 })
    )

    const result = await getMetaTemplateStatus('tpl-1', 'token-abc')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.result.rejectionReason).toBe('TAG_CONTENT_MISMATCH')
  })

  it("normalizes Meta's 'NONE' sentinel to null, never returning the literal string", async () => {
    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'APPROVED', rejected_reason: 'NONE' }), { status: 200 })
    )

    const result = await getMetaTemplateStatus('tpl-1', 'token-abc')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.result.rejectionReason).toBeNull()
  })

  it('requests fields=status,quality_score,rejected_reason,rejection_reason', async () => {
    fetchMock().mockResolvedValueOnce(new Response(JSON.stringify({ status: 'PENDING' }), { status: 200 }))

    await getMetaTemplateStatus('tpl-1', 'token-abc')

    const [url] = fetchMock().mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/tpl-1\?fields=status,quality_score,rejected_reason,rejection_reason$/)
  })

  it('returns { ok: false, status, error } on a non-200 response, never throws', async () => {
    fetchMock().mockResolvedValueOnce(new Response('not found', { status: 404 }))

    const result = await getMetaTemplateStatus('tpl-missing', 'token-abc')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.error).toBe('not found')
    }
  })
})

describe('updateMetaTemplate', () => {
  const fetchMock = () => global.fetch as ReturnType<typeof vi.fn>

  it('POSTs to the ITEM endpoint (no /message_templates suffix) and returns { ok: true } on 200', async () => {
    fetchMock().mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const newComponents = [{ type: 'BODY', text: 'Updated body {{1}}', example: { body_text: [['x']] } }]
    const result = await updateMetaTemplate('tpl-1', 'token-abc', newComponents)

    expect(result).toEqual({ ok: true })
    const [url, opts] = fetchMock().mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/tpl-1$/)
    expect(url).not.toContain('/message_templates')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({ components: newComponents })
  })

  it('returns { ok: false, status, error } on a non-200 response, never throws', async () => {
    fetchMock().mockResolvedValueOnce(new Response('forbidden', { status: 403 }))

    const result = await updateMetaTemplate('tpl-1', 'token-abc', [])

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toBe('forbidden')
    }
  })

  it('never throws when fetch itself rejects (network error)', async () => {
    fetchMock().mockRejectedValueOnce(new Error('network down'))

    const result = await updateMetaTemplate('tpl-1', 'token-abc', [])

    expect(result.ok).toBe(false)
  })
})

describe('extractRejectionReason', () => {
  it('returns null for an empty object', () => {
    expect(extractRejectionReason({})).toBeNull()
  })

  it("returns null when both fields are the literal 'NONE' sentinel", () => {
    expect(extractRejectionReason({ rejected_reason: 'NONE', rejection_reason: 'NONE' })).toBeNull()
  })

  it('prefers rejected_reason when both fields carry real values', () => {
    expect(
      extractRejectionReason({ rejected_reason: 'INVALID_FORMAT', rejection_reason: 'TAG_CONTENT_MISMATCH' })
    ).toBe('INVALID_FORMAT')
  })
})

describe('mapMetaEventToStatus', () => {
  it.each([
    ['APPROVED', 'approved'],
    ['REJECTED', 'rejected'],
    ['PENDING', 'pending'],
    ['PENDING_DELETION', 'pending'],
    ['PAUSED', 'paused'],
    ['DISABLED', 'disabled'],
    ['FLAGGED', 'flagged'],
    ['IN_APPEAL', 'in_appeal'],
    ['LOCKED', 'locked'],
    ['ARCHIVED', 'archived'],
    ['UNARCHIVED', 'approved'],
    ['REINSTATED', 'approved'],
    ['LIMIT_EXCEEDED', 'limit_exceeded'],
    ['DELETED', 'deleted'],
  ])('%s -> %s', (event, expected) => {
    expect(mapMetaEventToStatus(event)).toBe(expected)
  })

  it('falls through unknown future events to event.toLowerCase() for forward-compat', () => {
    expect(mapMetaEventToStatus('SOME_NEW_EVENT')).toBe('some_new_event')
  })

  it('PAUSED/DISABLED/FLAGGED/LOCKED are pairwise distinct and none equal approved', () => {
    const statuses = ['PAUSED', 'DISABLED', 'FLAGGED', 'LOCKED'].map(mapMetaEventToStatus)
    const unique = new Set(statuses)
    expect(unique.size).toBe(statuses.length)
    for (const s of statuses) expect(s).not.toBe('approved')
  })
})
