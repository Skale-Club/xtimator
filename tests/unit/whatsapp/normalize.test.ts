import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Quick task 260603-lrf — Task 1.
 *
 * normalizeMessage(msg, companyId, supabase) → { text, kind, ok, reason? }
 * Reuses transcribeAudioOR / analyzePhotoOR (same provider path as
 * estimate-graph.ts) and downloadWhatsAppMedia. Never throws — failures return
 * ok:false with a reason so the intent router can fall back gracefully.
 */

const mockTranscribe = vi.fn()
const mockAnalyzePhoto = vi.fn()
const mockDownload = vi.fn()

vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => mockTranscribe(...args),
  analyzePhotoOR: (...args: unknown[]) => mockAnalyzePhoto(...args),
}))

vi.mock('@/lib/whatsapp/client', () => ({
  downloadWhatsAppMedia: (...args: unknown[]) => mockDownload(...args),
}))

import { normalizeMessage } from '@/lib/whatsapp/normalize'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const supabase = {} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('normalizeMessage', () => {
  it('Test 1: text passthrough returns body unchanged', async () => {
    const msg: WhatsAppMessage = {
      id: 'm1',
      from: '1555',
      timestamp: '1',
      type: 'text',
      text: { body: 'replace kitchen cabinets' },
    }
    const result = await normalizeMessage(msg, 'company-1', supabase)
    expect(result).toEqual({ text: 'replace kitchen cabinets', kind: 'text', ok: true })
    expect(mockTranscribe).not.toHaveBeenCalled()
  })

  it('Test 2: audio path calls transcribeAudioOR with m4a when mime is audio/mp4', async () => {
    mockDownload.mockResolvedValue(Buffer.from('audio-bytes'))
    mockTranscribe.mockResolvedValue('transcribed text')
    const msg: WhatsAppMessage = {
      id: 'm2',
      from: '1555',
      timestamp: '1',
      type: 'audio',
      audio: { id: 'media-a', mime_type: 'audio/mp4' },
    }
    const result = await normalizeMessage(msg, 'company-1', supabase)

    expect(mockDownload).toHaveBeenCalledWith('media-a')
    // ext must be remapped mp4 → m4a for Whisper
    expect(mockTranscribe).toHaveBeenCalledTimes(1)
    expect(mockTranscribe.mock.calls[0][1]).toBe('m4a')
    expect(result).toEqual({ text: 'transcribed text', kind: 'audio', ok: true })
  })

  it('Test 2b: audio with codec param strips the codec before splitting', async () => {
    mockDownload.mockResolvedValue(Buffer.from('audio-bytes'))
    mockTranscribe.mockResolvedValue('hi')
    const msg: WhatsAppMessage = {
      id: 'm2b',
      from: '1555',
      timestamp: '1',
      type: 'audio',
      audio: { id: 'media-b', mime_type: 'audio/ogg; codecs=opus' },
    }
    await normalizeMessage(msg, 'company-1', supabase)
    expect(mockTranscribe.mock.calls[0][1]).toBe('ogg')
  })

  it('Test 3: photo path calls analyzePhotoOR with base64 and includes caption', async () => {
    mockDownload.mockResolvedValue(Buffer.from('img-bytes'))
    mockAnalyzePhoto.mockResolvedValue('a broken tile floor')
    const msg: WhatsAppMessage = {
      id: 'm3',
      from: '1555',
      timestamp: '1',
      type: 'image',
      image: { id: 'media-i', mime_type: 'image/jpeg', caption: 'see this' },
    }
    const result = await normalizeMessage(msg, 'company-1', supabase)

    expect(mockDownload).toHaveBeenCalledWith('media-i')
    expect(mockAnalyzePhoto).toHaveBeenCalledTimes(1)
    expect(mockAnalyzePhoto.mock.calls[0][0]).toBe(Buffer.from('img-bytes').toString('base64'))
    expect(mockAnalyzePhoto.mock.calls[0][1]).toBe('image/jpeg')
    expect(result.kind).toBe('photo')
    expect(result.ok).toBe(true)
    // caption is included in the normalized text
    expect(result.text).toContain('see this')
    expect(result.text).toContain('a broken tile floor')
  })

  it('Test 4: download failure returns ok:false (no throw)', async () => {
    mockDownload.mockRejectedValue(new Error('media gone'))
    const msg: WhatsAppMessage = {
      id: 'm4',
      from: '1555',
      timestamp: '1',
      type: 'audio',
      audio: { id: 'media-x', mime_type: 'audio/ogg' },
    }
    const result = await normalizeMessage(msg, 'company-1', supabase)
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('audio')
    expect(result.reason).toBeTruthy()
  })

  it('Test 4b: transcription failure returns ok:false (no throw)', async () => {
    mockDownload.mockResolvedValue(Buffer.from('a'))
    mockTranscribe.mockRejectedValue(new Error('whisper down'))
    const msg: WhatsAppMessage = {
      id: 'm4b',
      from: '1555',
      timestamp: '1',
      type: 'audio',
      audio: { id: 'media-y', mime_type: 'audio/ogg' },
    }
    const result = await normalizeMessage(msg, 'company-1', supabase)
    expect(result.ok).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('unsupported type returns kind unknown, ok false', async () => {
    const msg: WhatsAppMessage = {
      id: 'm5',
      from: '1555',
      timestamp: '1',
      type: 'sticker',
    }
    const result = await normalizeMessage(msg, 'company-1', supabase)
    expect(result.kind).toBe('unknown')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('unsupported_type')
  })
})
