import { describe, it, expect, vi, beforeEach } from 'vitest'

// Heavy real-module imports loaded at runtime via dynamic import; under vitest's
// reused forked worker they can exceed the 5s default (import latency under
// contention, not a mock leak). Per-file timeout keeps them deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * UNIFY-01 — shared multimodal ingestion (Wave 0 RED scaffold; source lands in Wave 1).
 *
 * `lib/estimate/ingest/multimodal.ts` exposes `ingestMultimodal(input)` — the single
 * channel-neutral "raw media -> text" path reused by refine + WhatsApp + (assembly-level)
 * web/MCP. Given audio Blobs + base64 photos + free-form texts it returns
 * `{ transcripts, photoDescriptions, texts }` over the fallback-wrapped primitives
 * `transcribeAudioOR` / `analyzePhotoOR`. A SINGLE failed item is SKIPPED (never thrown);
 * texts are trimmed and empties filtered.
 *
 * The ingestion primitives are mocked so the assertions target the aggregation/
 * skip-on-failure behavior, not the network. The module-under-test is imported
 * statically below the vi.mock calls (which vitest hoists), so the mocks
 * deterministically intercept its dependencies.
 */

import { ingestMultimodal } from '@/lib/estimate/ingest/multimodal'

const mockTranscribe = vi.fn()
const mockAnalyzePhoto = vi.fn()

vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => mockTranscribe(...args),
  analyzePhotoOR: (...args: unknown[]) => mockAnalyzePhoto(...args),
}))

function makeAudioBlob(): Blob {
  return new Blob(['audio-bytes'], { type: 'audio/webm' })
}

describe('UNIFY-01: ingestMultimodal aggregates audio/photo/text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Phase 167 (BILL-05): transcribeAudioOR resolves { text, servedBy }, not a
    // bare string — ingestMultimodal destructures `.text`.
    mockTranscribe.mockResolvedValue({ text: 'TRANSCRIPT', servedBy: 'primary' })
    mockAnalyzePhoto.mockResolvedValue('DESC')
  })

  it('aggregates one audio + one photo + one text (texts trimmed, empties filtered)', async () => {
    const result = await ingestMultimodal({
      audio: [{ blob: makeAudioBlob(), ext: 'webm' }],
      photos: [{ base64: 'AAAA', mimeType: 'image/jpeg' }],
      texts: ['  hello  '],
    })

    expect(result).toEqual({
      transcripts: ['TRANSCRIPT'],
      photoDescriptions: ['DESC'],
      texts: ['hello'],
    })
  })

  it('a single transcription failure is SKIPPED, not thrown — the good audio item still returns', async () => {
    // First audio item rejects, second resolves. ingestMultimodal must still RESOLVE.
    mockTranscribe
      .mockRejectedValueOnce(new Error('Whisper 500'))
      .mockResolvedValueOnce({ text: 'GOOD_TRANSCRIPT', servedBy: 'primary' })

    const call = ingestMultimodal({
      audio: [
        { blob: makeAudioBlob(), ext: 'webm' },
        { blob: makeAudioBlob(), ext: 'webm' },
      ],
    })

    // resolves, NOT rejects — failed item skipped.
    await expect(call).resolves.toBeDefined()
    const result = await call
    expect(result.transcripts).toEqual(['GOOD_TRANSCRIPT'])
  })

  it('a single vision failure is SKIPPED — the good photo description still returns', async () => {
    mockAnalyzePhoto
      .mockRejectedValueOnce(new Error('vision down'))
      .mockResolvedValueOnce('GOOD_DESC')

    const call = ingestMultimodal({
      photos: [
        { base64: 'AAAA', mimeType: 'image/jpeg' },
        { base64: 'BBBB', mimeType: 'image/png' },
      ],
    })

    await expect(call).resolves.toBeDefined()
    const result = await call
    expect(result.photoDescriptions).toEqual(['GOOD_DESC'])
  })

  it('empty input {} returns empty arrays for every modality', async () => {
    const result = await ingestMultimodal({})

    expect(result).toEqual({
      transcripts: [],
      photoDescriptions: [],
      texts: [],
    })
  })
})
