import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Shared WhatsApp inbound-media helpers (lib/whatsapp/media.ts).
 *
 * This module is the SINGLE source of the WhatsApp-specific media logic consumed
 * by BOTH ingestion paths — lib/whatsapp/normalize.ts (intent-router) and
 * lib/estimate/adapters/whatsapp.ts (CREATE-graph adapter). These tests cover the
 * shared logic directly:
 *   - deriveAudioFormat: codec-param strip + the load-bearing mp4 → m4a remap
 *     (OpenAI Whisper container detection).
 *   - deriveImageFormat: image jpeg default + extension derivation.
 *   - transcribeAudioBuffer / analyzeImageBuffer: the buffer -> transcript /
 *     buffer -> description invocation over the channel-neutral ingestMultimodal
 *     primitive (fallback-wrapped transcribeAudioOR / analyzePhotoOR underneath).
 *
 * The AI primitives are mocked so the assertions target derivation + invocation
 * wiring, not the network.
 */

const mockTranscribe = vi.fn()
const mockAnalyzePhoto = vi.fn()

vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => mockTranscribe(...args),
  analyzePhotoOR: (...args: unknown[]) => mockAnalyzePhoto(...args),
}))

import {
  deriveAudioFormat,
  deriveImageFormat,
  transcribeAudioBuffer,
  analyzeImageBuffer,
} from '@/lib/whatsapp/media'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('deriveAudioFormat', () => {
  it('remaps mp4 → m4a so Whisper can detect the container (iOS)', () => {
    expect(deriveAudioFormat('audio/mp4')).toEqual({ mimeType: 'audio/mp4', ext: 'm4a' })
  })

  it('strips the codec parameter before splitting (Android)', () => {
    expect(deriveAudioFormat('audio/ogg; codecs=opus')).toEqual({
      mimeType: 'audio/ogg',
      ext: 'ogg',
    })
  })

  it('defaults to audio/ogg when the mime type is missing', () => {
    expect(deriveAudioFormat(undefined)).toEqual({ mimeType: 'audio/ogg', ext: 'ogg' })
  })
})

describe('deriveImageFormat', () => {
  it('defaults to image/jpeg when the mime type is missing', () => {
    expect(deriveImageFormat(undefined)).toEqual({ mimeType: 'image/jpeg', ext: 'jpeg' })
  })

  it('derives the extension from the subtype', () => {
    expect(deriveImageFormat('image/png')).toEqual({ mimeType: 'image/png', ext: 'png' })
  })
})

describe('transcribeAudioBuffer', () => {
  it('passes the derived ext through to the transcriber and returns the transcript', async () => {
    mockTranscribe.mockResolvedValue('transcribed text')
    const buf = Buffer.from('audio-bytes')
    const text = await transcribeAudioBuffer(buf, deriveAudioFormat('audio/mp4'))

    expect(mockTranscribe).toHaveBeenCalledTimes(1)
    // ext must be the remapped m4a — the load-bearing bit for Whisper.
    expect(mockTranscribe.mock.calls[0][1]).toBe('m4a')
    expect(text).toBe('transcribed text')
  })

  it('returns "" when ingestMultimodal skips the item (empty result)', async () => {
    // ingestMultimodal only pushes truthy transcripts, so an empty string is skipped.
    mockTranscribe.mockResolvedValue('')
    const text = await transcribeAudioBuffer(Buffer.from('a'), deriveAudioFormat('audio/ogg'))
    expect(text).toBe('')
  })
})

describe('analyzeImageBuffer', () => {
  it('passes base64 + mime to the vision primitive and returns the description', async () => {
    mockAnalyzePhoto.mockResolvedValue('a broken tile floor')
    const buf = Buffer.from('img-bytes')
    const desc = await analyzeImageBuffer(buf, 'image/jpeg')

    expect(mockAnalyzePhoto).toHaveBeenCalledTimes(1)
    expect(mockAnalyzePhoto.mock.calls[0][0]).toBe(buf.toString('base64'))
    expect(mockAnalyzePhoto.mock.calls[0][1]).toBe('image/jpeg')
    expect(desc).toBe('a broken tile floor')
  })

  it('returns "" when ingestMultimodal skips the item (empty result)', async () => {
    mockAnalyzePhoto.mockResolvedValue('')
    const desc = await analyzeImageBuffer(Buffer.from('a'), 'image/jpeg')
    expect(desc).toBe('')
  })
})
