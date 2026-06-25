import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * NEUT-03 (RED scaffold) — neutral normalizeInput.
 *
 * lib/agent-tools/normalize-input.ts wraps ingestMultimodal
 * (lib/estimate/ingest/multimodal.ts) and returns the SAME
 * { text, kind, ok, reason? } shape lib/whatsapp/normalize.ts returns today —
 * BUT it takes a channel-neutral discriminated input (no WhatsAppMessage, no
 * downloadWhatsAppMedia). The codec/ext derivation now lives in the WhatsApp
 * ADAPTER (Plan 122-02), so this neutral test passes `ext` already-derived and
 * asserts the WRAP, not the derivation.
 *
 * We mock @/lib/ai/openrouter-client (the underlying primitives) so the REAL
 * ingestMultimodal wiring is exercised. NEVER throws — a primitive yielding
 * nothing returns { ok: false, reason } (parity with normalize.ts).
 *
 * RED by missing module (`@/lib/agent-tools/normalize-input` does not exist
 * until Plan 122-02). Module-not-found is the correct RED state.
 */

const mockTranscribe = vi.fn()
const mockAnalyzePhoto = vi.fn()

vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => mockTranscribe(...args),
  analyzePhotoOR: (...args: unknown[]) => mockAnalyzePhoto(...args),
}))

import { normalizeInput } from '@/lib/agent-tools/normalize-input'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('normalizeInput — channel-neutral multimodal -> text', () => {
  it('Test 1: text passthrough returns body unchanged; transcribe not called', async () => {
    const result = await normalizeInput({ kind: 'text', body: 'replace kitchen cabinets' })
    expect(result).toEqual({ text: 'replace kitchen cabinets', kind: 'text', ok: true })
    expect(mockTranscribe).not.toHaveBeenCalled()
  })

  it('Test 2: audio path calls transcribeAudioOR with the supplied ext, returns kind audio', async () => {
    mockTranscribe.mockResolvedValue('transcribed text')
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' })
    const result = await normalizeInput({ kind: 'audio', blob, ext: 'm4a' })

    expect(mockTranscribe).toHaveBeenCalledTimes(1)
    // ext is passed already-derived (derivation moved to the WhatsApp adapter).
    expect(mockTranscribe.mock.calls[0][1]).toBe('m4a')
    expect(result).toEqual({ text: 'transcribed text', kind: 'audio', ok: true })
  })

  it('Test 3: photo path calls analyzePhotoOR(base64, mime); text includes caption + analysis', async () => {
    mockAnalyzePhoto.mockResolvedValue('a broken tile floor')
    const result = await normalizeInput({
      kind: 'photo',
      base64: 'aW1n',
      mimeType: 'image/jpeg',
      caption: 'see this',
    })

    expect(mockAnalyzePhoto).toHaveBeenCalledTimes(1)
    expect(mockAnalyzePhoto.mock.calls[0][0]).toBe('aW1n')
    expect(mockAnalyzePhoto.mock.calls[0][1]).toBe('image/jpeg')
    expect(result.kind).toBe('photo')
    expect(result.ok).toBe(true)
    expect(result.text).toContain('see this')
    expect(result.text).toContain('a broken tile floor')
  })

  it('Test 4: when the primitive yields nothing, returns ok:false with a reason (no throw)', async () => {
    mockTranscribe.mockResolvedValue('')
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/ogg' })
    const result = await normalizeInput({ kind: 'audio', blob, ext: 'ogg' })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('audio')
    expect(result.reason).toBeTruthy()
  })
})
