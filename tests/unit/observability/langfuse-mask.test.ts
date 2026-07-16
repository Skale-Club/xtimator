import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { maskLangfuseData } from '@/lib/observability/langfuse-mask'

/**
 * Pre-launch audit fix (IA/low, 2026-07-06): full prompts (transcripts, PII)
 * flowed into Langfuse trace input/output, conflicting with the declared
 * safe-metadata posture. maskLangfuseData is wired as the LangfuseSpanProcessor
 * `mask` in instrumentation.ts — these tests pin the policy.
 */

describe('maskLangfuseData — safe scalars are preserved', () => {
  it('keeps numbers, booleans and null unchanged', () => {
    expect(maskLangfuseData({ data: 42 })).toBe(42)
    expect(maskLangfuseData({ data: true })).toBe(true)
    expect(maskLangfuseData({ data: null })).toBe(null)
    expect(maskLangfuseData({ data: undefined })).toBe(undefined)
  })

  it('keeps single-token strings: UUIDs, enums, model slugs, ISO dates', () => {
    const uuid = 'f2b95485-277f-479a-abc3-04d23b98797b'
    expect(maskLangfuseData({ data: uuid })).toBe(uuid)
    expect(maskLangfuseData({ data: 'whatsapp' })).toBe('whatsapp')
    expect(maskLangfuseData({ data: 'anthropic/claude-sonnet-5' })).toBe(
      'anthropic/claude-sonnet-5'
    )
    expect(maskLangfuseData({ data: '2026-07-16T12:00:00.000Z' })).toBe(
      '2026-07-16T12:00:00.000Z'
    )
  })

  it('keeps object structure and numeric/boolean/id fields', () => {
    const result = maskLangfuseData({
      data: {
        projectId: 'f2b95485-277f-479a-abc3-04d23b98797b',
        channel: 'whatsapp',
        isVague: false,
        promptTokens: 843,
        usage: { input: 100, output: 50 },
      },
    })
    expect(result).toEqual({
      projectId: 'f2b95485-277f-479a-abc3-04d23b98797b',
      channel: 'whatsapp',
      isVague: false,
      promptTokens: 843,
      usage: { input: 100, output: 50 },
    })
  })
})

describe('maskLangfuseData — free text is redacted with length preserved', () => {
  it('redacts multi-word strings as [redacted N chars]', () => {
    const transcript =
      'Hi, this is John Smith at 42 Oak Street, we need the whole backyard relandscaped'
    expect(maskLangfuseData({ data: transcript })).toBe(
      `[redacted ${transcript.length} chars]`
    )
  })

  it('redacts long single tokens (base64, JWTs) over 64 chars', () => {
    const blob = 'A'.repeat(400)
    expect(maskLangfuseData({ data: blob })).toBe('[redacted 400 chars]')
  })

  it('redacts values under content-bearing keys even when short', () => {
    const result = maskLangfuseData({
      data: { content: 'ok', transcript: 'oi', name: 'Silva' },
    }) as Record<string, string>
    expect(result.content).toBe('[redacted 2 chars]')
    expect(result.transcript).toBe('[redacted 2 chars]')
    expect(result.name).toBe('[redacted 5 chars]')
  })

  it('redacts chat message content but keeps roles (LangChain messages shape)', () => {
    const result = maskLangfuseData({
      data: [
        { role: 'system', content: 'You are an estimator for a landscaping business.' },
        { role: 'user', content: 'Transcript: the client wants a new patio, roughly 30x20.' },
      ],
    }) as Array<{ role: string; content: string }>
    expect(result[0].role).toBe('system')
    expect(result[0].content).toMatch(/^\[redacted \d+ chars\]$/)
    expect(result[1].role).toBe('user')
    expect(result[1].content).toMatch(/^\[redacted \d+ chars\]$/)
  })
})

describe('maskLangfuseData — direct PII patterns', () => {
  it('redacts emails and phone numbers wherever they appear', () => {
    expect(maskLangfuseData({ data: 'john.smith@example.com' })).toBe('[redacted email]')
    expect(maskLangfuseData({ data: '+15551234567' })).toBe('[redacted phone]')
    expect(maskLangfuseData({ data: '(555) 123-4567' })).toBe('[redacted phone]')
  })

  it('does not treat UUIDs or short numeric enums as phones', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000'
    expect(maskLangfuseData({ data: uuid })).toBe(uuid)
    expect(maskLangfuseData({ data: '42' })).toBe('42')
  })
})

describe('maskLangfuseData — JSON-serialized span attributes', () => {
  it('parses JSON strings, masks structurally, and re-serializes', () => {
    const payload = JSON.stringify({
      model: 'anthropic/claude-sonnet-5',
      messages: [{ role: 'user', content: 'full walkthrough transcript here' }],
    })
    const masked = maskLangfuseData({ data: payload }) as string
    const parsed = JSON.parse(masked) as {
      model: string
      messages: Array<{ role: string; content: string }>
    }
    expect(parsed.model).toBe('anthropic/claude-sonnet-5')
    expect(parsed.messages[0].role).toBe('user')
    expect(parsed.messages[0].content).toBe('[redacted 32 chars]')
  })

  it('falls back to plain-string policy for non-JSON strings', () => {
    expect(maskLangfuseData({ data: 'not json at all' })).toBe('[redacted 15 chars]')
  })

  it('handles malformed JSON-looking strings without throwing', () => {
    const broken = '{ "content": "unterminated'
    expect(maskLangfuseData({ data: broken })).toBe(
      `[redacted ${broken.length} chars]`
    )
  })
})

describe('maskLangfuseData — robustness', () => {
  it('survives circular references instead of recursing forever', () => {
    const a: Record<string, unknown> = { id: 'abc' }
    a.self = a
    const result = maskLangfuseData({ data: a }) as Record<string, unknown>
    expect(result.id).toBe('abc')
    expect(result.self).toBe('[circular]')
  })

  it('keeps empty strings unchanged', () => {
    expect(maskLangfuseData({ data: '' })).toBe('')
  })
})

describe('instrumentation.ts — mask is wired into the LangfuseSpanProcessor', () => {
  it('constructs LangfuseSpanProcessor with mask: maskLangfuseData', () => {
    const src = readFileSync(resolve(process.cwd(), 'instrumentation.ts'), 'utf8')
    expect(src).toContain('mask: maskLangfuseData')
    expect(src).toMatch(/import \{ maskLangfuseData \} from '@\/lib\/observability\/langfuse-mask'/)
  })
})
