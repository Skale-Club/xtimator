import { describe, it, expect } from 'vitest'
import {
  TRANSCRIPTION_MODELS,
  DEFAULT_TRANSCRIPTION_MODEL,
  coerceTranscriptionModel,
} from '@/lib/platform-config'

describe('transcription allowlist (Whisper only)', () => {
  it('lists only openai/whisper-1', () => {
    expect([...TRANSCRIPTION_MODELS]).toEqual(['openai/whisper-1'])
  })

  it('keeps whisper and normalises the bare legacy id', () => {
    expect(coerceTranscriptionModel('openai/whisper-1')).toBe('openai/whisper-1')
    expect(coerceTranscriptionModel('whisper-1')).toBe('openai/whisper-1')
  })

  it('coerces any other stored value (and empty) to whisper-1', () => {
    const stored = [
      'openai/gpt-4o-transcribe',
      'openai/gpt-4o-mini-transcribe',
      'gpt-4o-transcribe',
      '',
      '  ',
      null,
      undefined,
    ]
    for (const v of stored) {
      expect(coerceTranscriptionModel(v)).toBe(DEFAULT_TRANSCRIPTION_MODEL)
    }
  })
})
