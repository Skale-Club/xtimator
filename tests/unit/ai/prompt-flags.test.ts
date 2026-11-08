// Phase 4a: ESTIMATOR_PRICE_BOOK_MAX and ESTIMATOR_PROMPT_CACHE, both default OFF.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildSystemPrompt,
  buildSystemPromptParts,
  priceBookPromptMax,
  promptCacheEnabled,
} from '@/lib/ai/prompt-builder'
import { systemMessageContent, cacheMetadata } from '@/lib/ai/providers/openrouter'
import type { EstimateInput } from '@/lib/ai/types'
import { FIXTURES, FULL_INPUT } from './fixtures/prompt-flags-fixtures'

const golden: Record<string, string> = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/prompt-flags-off.golden.json'), 'utf8'),
)

afterEach(() => vi.unstubAllEnvs())

function bigBook(n: number): EstimateInput['priceBookItems'] {
  return Array.from({ length: n }, (_, i) => ({
    folder_name: 'Misc',
    name: `Widget model ${i}`,
    unit: 'each',
    unit_price: 10 + i,
    currency_code: 'USD',
  }))
}

describe('flags off: byte-identical to the pre-4a prompt', () => {
  for (const [name, f] of Object.entries(FIXTURES)) {
    it(`${name} matches the golden output`, () => {
      expect(buildSystemPrompt(f.input, { mode: f.mode })).toBe(golden[name])
    })
  }

  it('invalid flag values count as off', () => {
    for (const v of ['', '0', '-3', 'abc', '1.5', '0x10']) {
      vi.stubEnv('ESTIMATOR_PRICE_BOOK_MAX', v)
      expect(priceBookPromptMax()).toBeNull()
    }
    for (const v of ['', '0', 'no', 'off', 'false']) {
      vi.stubEnv('ESTIMATOR_PROMPT_CACHE', v)
      expect(promptCacheEnabled()).toBe(false)
    }
    expect(buildSystemPrompt(FULL_INPUT)).toBe(golden.generateFull)
  })

  it('parts report no static prefix', () => {
    expect(buildSystemPromptParts(FULL_INPUT).staticPrefix).toBeNull()
  })
})

describe('ESTIMATOR_PRICE_BOOK_MAX', () => {
  it('limits only the prompt book and notes that it is a subset', () => {
    const book = [...bigBook(200), ...(FULL_INPUT.priceBookItems ?? [])]
    const input = { ...FULL_INPUT, priceBookItems: book }
    vi.stubEnv('ESTIMATOR_PRICE_BOOK_MAX', '5')
    const prompt = buildSystemPrompt(input)
    const lines = prompt.split('\n').filter((l) => /^- .+ \| .+ \| .+\/.+$/.test(l) && !l.startsWith('- Add'))
    expect(prompt).toContain('relevant subset of the company price book')
    expect(prompt).toContain('Architectural shingles install')
    expect(prompt).not.toContain('Widget model 150')
    expect(lines.length).toBeLessThan(20)
    // the input handed to the builder (what anchoring sees) is untouched
    expect(input.priceBookItems).toHaveLength(203)
  })

  it('adds no note and no change when the book already fits', () => {
    vi.stubEnv('ESTIMATOR_PRICE_BOOK_MAX', '100')
    expect(buildSystemPrompt(FULL_INPUT)).toBe(golden.generateFull)
  })

  it('refine mode picks the subset from opts.sourceText', () => {
    const input = { ...FULL_INPUT, transcripts: [], photoDescriptions: [], prompts: [], priceBookItems: bigBook(50) }
    vi.stubEnv('ESTIMATOR_PRICE_BOOK_MAX', '3')
    const prompt = buildSystemPrompt(input, { mode: 'refine', sourceText: 'change the Widget model 7 price' })
    expect(prompt).toContain('Widget model 7')
    expect(prompt).toContain('relevant subset')
  })
})

describe('ESTIMATOR_PROMPT_CACHE', () => {
  const heading = (p: string, h: string) => p.indexOf(h)

  it('puts static sections first and dynamic ones last, each text unchanged', () => {
    vi.stubEnv('ESTIMATOR_PROMPT_CACHE', '1')
    const { prompt, staticPrefix } = buildSystemPromptParts(FULL_INPUT)
    expect(staticPrefix).not.toBeNull()
    expect(prompt.startsWith(staticPrefix as string)).toBe(true)
    const order = [
      'You are a professional estimator',
      '## Language',
      '## Estimate structure',
      '## Tax Classification',
      '## Security',
      '## Trade playbook',
      '## Your Company Price Book',
      '## Document blocks',
    ].map((h) => heading(prompt, h))
    expect(order.every((i) => i >= 0)).toBe(true)
    // static group before dynamic group
    expect(Math.max(...order.slice(0, 5))).toBeLessThan(Math.min(...order.slice(5)))
    // the static prefix holds no dynamic section
    for (const h of ['## Trade playbook', '## Your Company Price Book', '## Document blocks', '## Additional Instructions']) {
      expect(staticPrefix).not.toContain(h)
    }
    // every section's text still appears verbatim (same multiset of sections as flags off)
    const sections = (s: string) => s.split('\n\n## ').length
    expect(sections(prompt)).toBe(sections(golden.generateFull))
    expect([...golden.generateFull.split('\n\n')].sort()).toEqual([...prompt.split('\n\n')].sort())
  })

  it('is independent of the dynamic input (stable prefix)', () => {
    vi.stubEnv('ESTIMATOR_PROMPT_CACHE', 'on')
    const a = buildSystemPromptParts(FULL_INPUT).staticPrefix
    const b = buildSystemPromptParts({
      ...FULL_INPUT,
      transcripts: ['something else entirely'],
      priceBookItems: bigBook(3),
      extraInstructions: undefined,
      knowledge: undefined,
    }).staticPrefix
    expect(b).toBe(a)
  })

  it('sends content parts with cache_control on exactly one part', () => {
    vi.stubEnv('ESTIMATOR_PROMPT_CACHE', 'true')
    const { prompt, staticPrefix } = buildSystemPromptParts(FULL_INPUT)
    const content = systemMessageContent(prompt, staticPrefix)
    expect(Array.isArray(content)).toBe(true)
    const parts = content as Array<{ type: string; text: string; cache_control?: unknown }>
    expect(parts.filter((p) => p.cache_control)).toHaveLength(1)
    expect(parts[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(parts[0].text).toBe(staticPrefix)
    expect(parts.map((p) => p.text).join('\n\n')).toBe(prompt)
  })

  it('flag off leaves the system message a plain string', () => {
    const { prompt, staticPrefix } = buildSystemPromptParts(FULL_INPUT)
    expect(systemMessageContent(prompt, staticPrefix)).toBe(prompt)
  })
})

describe('cacheMetadata', () => {
  it('is empty when nothing was requested or reported', () => {
    expect(cacheMetadata({ prompt_tokens: 10 }, false)).toEqual({})
  })
  it('reads OpenRouter and raw Anthropic fields', () => {
    expect(cacheMetadata({ prompt_tokens_details: { cached_tokens: 900 } }, true)).toEqual({
      metadata: { promptCacheRequested: true, cachedTokens: 900 },
    })
    expect(
      cacheMetadata({ cache_read_input_tokens: 5, cache_creation_input_tokens: 7 }, false),
    ).toEqual({ metadata: { promptCacheRequested: false, cachedTokens: 5, cacheWriteTokens: 7 } })
  })
})
