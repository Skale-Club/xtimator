/**
 * CHATUI-03 — normalizeChatInput server action.
 *
 * Thin owner-scoped wrapper over the neutral normalizeInput (lib/agent-tools).
 * Mirrors the app/api/chat/route.ts auth posture: authenticate the owner via
 * supabase.auth.getClaims() then resolve the ACTIVE company (never from the body).
 *   - no claims          → { ok:false, text:'', reason:'unauthorized' }
 *   - no active company  → { ok:false, text:'', reason:'no_active_company' }
 *   - audio → reconstruct a Blob from base64, forward {kind:'audio', ext}
 *   - photo → forward {kind:'photo', base64, mimeType, caption}
 *   - returns normalizeInput's { ok, text, reason }; NEVER throws
 *
 * No credit code (CHATMETER-01 inherited via ingestMultimodal in normalizeInput).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getClaimsMock, getActiveCompanyIdMock, normalizeInputMock } = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  getActiveCompanyIdMock: vi.fn(),
  normalizeInputMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: getActiveCompanyIdMock,
}))

vi.mock('@/lib/agent-tools', () => ({
  normalizeInput: (...args: unknown[]) => normalizeInputMock(...args),
}))

import { normalizeChatInput } from '@/lib/actions/chat'

beforeEach(() => {
  vi.clearAllMocks()
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
  getActiveCompanyIdMock.mockResolvedValue('company-1')
  normalizeInputMock.mockResolvedValue({ text: 'transcribed', kind: 'audio', ok: true })
})

describe('normalizeChatInput (CHATUI-03)', () => {
  it('returns unauthorized when there is no auth claim', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null } })
    const r = await normalizeChatInput({ kind: 'photo', base64: 'x', mimeType: 'image/png' })
    expect(r).toEqual({ ok: false, text: '', reason: 'unauthorized' })
    expect(normalizeInputMock).not.toHaveBeenCalled()
  })

  it('returns no_active_company when no active company resolves', async () => {
    getActiveCompanyIdMock.mockResolvedValue(null)
    const r = await normalizeChatInput({ kind: 'photo', base64: 'x', mimeType: 'image/png' })
    expect(r).toEqual({ ok: false, text: '', reason: 'no_active_company' })
    expect(normalizeInputMock).not.toHaveBeenCalled()
  })

  it('forwards the photo input verbatim and returns the normalized text', async () => {
    normalizeInputMock.mockResolvedValue({ text: 'a red wall', kind: 'photo', ok: true })
    const r = await normalizeChatInput({
      kind: 'photo',
      base64: 'BASE64',
      mimeType: 'image/jpeg',
      caption: 'living room',
    })
    expect(normalizeInputMock).toHaveBeenCalledWith({
      kind: 'photo',
      base64: 'BASE64',
      mimeType: 'image/jpeg',
      caption: 'living room',
    })
    expect(r).toEqual({ ok: true, text: 'a red wall', reason: undefined })
  })

  it('reconstructs a Blob for audio and forwards {kind:audio, ext}', async () => {
    normalizeInputMock.mockResolvedValue({ text: 'hello there', kind: 'audio', ok: true })
    const r = await normalizeChatInput({ kind: 'audio', base64: 'aGVsbG8=', ext: 'webm' })
    expect(normalizeInputMock).toHaveBeenCalledTimes(1)
    const arg = normalizeInputMock.mock.calls[0][0] as { kind: string; blob: Blob; ext: string }
    expect(arg.kind).toBe('audio')
    expect(arg.ext).toBe('webm')
    expect(arg.blob).toBeInstanceOf(Blob)
    expect(r).toEqual({ ok: true, text: 'hello there', reason: undefined })
  })

  it('propagates a failure reason from normalizeInput', async () => {
    normalizeInputMock.mockResolvedValue({
      text: '',
      kind: 'audio',
      ok: false,
      reason: 'empty_transcript',
    })
    const r = await normalizeChatInput({ kind: 'audio', base64: 'aGVsbG8=', ext: 'webm' })
    expect(r).toEqual({ ok: false, text: '', reason: 'empty_transcript' })
  })
})
