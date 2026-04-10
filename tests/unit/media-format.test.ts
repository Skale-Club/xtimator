import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSupportedAudioMimeType, getFileExtension, formatDuration } from '@/lib/utils/media-format'

describe('getSupportedAudioMimeType', () => {
  beforeEach(() => {
    // Reset MediaRecorder mock
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn(() => false),
    })
  })

  it('returns audio/webm;codecs=opus when supported (Chrome/Android)', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((type: string) => type === 'audio/webm;codecs=opus'),
    })
    expect(getSupportedAudioMimeType()).toBe('audio/webm;codecs=opus')
  })

  it('returns audio/mp4 when only mp4 is supported (iOS Safari)', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((type: string) => type === 'audio/mp4'),
    })
    expect(getSupportedAudioMimeType()).toBe('audio/mp4')
  })

  it('returns audio/ogg;codecs=opus when only ogg is supported (Firefox)', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((type: string) => type === 'audio/ogg;codecs=opus'),
    })
    expect(getSupportedAudioMimeType()).toBe('audio/ogg;codecs=opus')
  })

  it('returns empty string when no types supported', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn(() => false),
    })
    expect(getSupportedAudioMimeType()).toBe('')
  })

  it('returns empty string when MediaRecorder is undefined', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(getSupportedAudioMimeType()).toBe('')
  })
})

describe('getFileExtension', () => {
  it('returns webm for audio/webm;codecs=opus', () => {
    expect(getFileExtension('audio/webm;codecs=opus')).toBe('webm')
  })

  it('returns mp4 for audio/mp4', () => {
    expect(getFileExtension('audio/mp4')).toBe('mp4')
  })

  it('returns ogg for audio/ogg;codecs=opus', () => {
    expect(getFileExtension('audio/ogg;codecs=opus')).toBe('ogg')
  })

  it('returns webm for unknown mime type', () => {
    expect(getFileExtension('audio/unknown')).toBe('webm')
  })
})

describe('formatDuration', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00')
  })

  it('formats 65 seconds as 01:05', () => {
    expect(formatDuration(65)).toBe('01:05')
  })

  it('formats 3600 seconds as 60:00', () => {
    expect(formatDuration(3600)).toBe('60:00')
  })

  it('formats 5 seconds as 00:05', () => {
    expect(formatDuration(5)).toBe('00:05')
  })
})
