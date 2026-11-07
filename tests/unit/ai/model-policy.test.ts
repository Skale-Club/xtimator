import { describe, it, expect } from 'vitest'
import { isAllowedChatModel, coerceChatModel } from '@/lib/ai/model-policy'
import { OR_DEFAULTS } from '@/lib/ai/openrouter-client'

describe('model policy', () => {
  it('pins the owner defaults', () => {
    expect(OR_DEFAULTS.chat).toBe('anthropic/claude-sonnet-5.5')
    expect(OR_DEFAULTS.fast).toBe('anthropic/claude-haiku-5.5')
  })

  it('allows Claude Sonnet and Opus only', () => {
    expect(isAllowedChatModel('anthropic/claude-sonnet-5.5')).toBe(true)
    expect(isAllowedChatModel('anthropic/claude-sonnet-4.5')).toBe(true)
    expect(isAllowedChatModel('anthropic/claude-opus-5')).toBe(true)
    expect(isAllowedChatModel(' anthropic/claude-sonnet-5.5 ')).toBe(true)
  })

  it('rejects Haiku, GPT, Gemini, bare prefixes and non-strings', () => {
    for (const bad of [
      'anthropic/claude-haiku-5.5',
      'openai/gpt-4o',
      'openai/whisper-1',
      'google/gemini-2.5-flash',
      'anthropic/claude-sonnet-',
      'anthropic/claude-sonnet',
      '',
      null,
      undefined,
      42,
    ]) {
      expect(isAllowedChatModel(bad)).toBe(false)
    }
  })

  it('coerceChatModel keeps allowed values and falls back otherwise', () => {
    expect(coerceChatModel('anthropic/claude-opus-5', OR_DEFAULTS.chat)).toBe('anthropic/claude-opus-5')
    expect(coerceChatModel('openai/gpt-4o', OR_DEFAULTS.chat)).toBe(OR_DEFAULTS.chat)
    expect(coerceChatModel(null, OR_DEFAULTS.chat)).toBe(OR_DEFAULTS.chat)
  })
})
