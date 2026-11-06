import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEED-057 Phase A: the output contract v2 keys exist, with the same names, on
// every adapter's create_estimate tool (openrouter / anthropic / gemini), and
// the zod gate stays tolerant of legacy and sloppy output.

const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) }
  },
}))
const mockGeminiGenerate = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: (...args: unknown[]) => mockGeminiGenerate(...args) }
  },
  Type: { OBJECT: 'object', STRING: 'string', NUMBER: 'number', ARRAY: 'array', BOOLEAN: 'boolean' },
  FunctionCallingConfigMode: { ANY: 'any' },
}))
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('test-key'),
}))

import { estimateToolSchema } from '@/lib/ai/providers/openrouter'
import { AnthropicAdapter } from '@/lib/ai/providers/anthropic'
import { GeminiAdapter } from '@/lib/ai/providers/gemini'
import { estimateOutputSchema } from '@/lib/ai/schema'
import { CANONICAL_UNITS, normalizeUnit, unitKey } from '@/lib/ai/units'
import type { EstimateInput } from '@/lib/ai/types'

const TOP_KEYS = ['assumptions', 'exclusions', 'open_questions', 'scope_confidence']
const SECTION_KEYS = ['purpose']
const ITEM_KEYS = ['confidence', 'basis', 'optional']

const baseInput: EstimateInput = {
  industry: 'painting',
  projectName: 'Test',
  projectType: null,
  targetBudget: null,
  clientName: null,
  clientAddress: null,
  transcripts: [],
  photoDescriptions: [],
  priceBookItems: [],
}

const okArgs = {
  suggested_project_name: 'Test',
  summary: 'S',
  sections: [{ title: 'Labor', items: [{ description: 'Paint', quantity: 1, unit_price: 10, price_source: 'ai_estimate' }] }],
}

type Schema = { properties: Record<string, any> }

function shape(schema: Schema) {
  const section = schema.properties.sections.items
  const item = section.properties.items.items
  return {
    top: Object.keys(schema.properties),
    section: Object.keys(section.properties),
    item: Object.keys(item.properties),
    questionKeys: Object.keys(schema.properties.open_questions.items.properties),
  }
}

describe('output contract v2: the three adapters carry the same keys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('openrouter (full schema)', () => {
    const s = shape(estimateToolSchema as unknown as Schema)
    expect(s.top).toEqual(expect.arrayContaining(TOP_KEYS))
    expect(s.section).toEqual(expect.arrayContaining(SECTION_KEYS))
    expect(s.item).toEqual(expect.arrayContaining(ITEM_KEYS))
    expect(s.questionKeys).toEqual(['question', 'impact'])
  })

  it('anthropic (generate mode)', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: okArgs }] })
    await new AnthropicAdapter().generateEstimate(baseInput)
    const s = shape(mockAnthropicCreate.mock.calls[0][0].tools[0].input_schema)
    expect(s.top).toEqual(expect.arrayContaining(TOP_KEYS))
    expect(s.section).toEqual(expect.arrayContaining(SECTION_KEYS))
    expect(s.item).toEqual(expect.arrayContaining(ITEM_KEYS))
    expect(s.questionKeys).toEqual(['question', 'impact'])
  })

  it('anthropic (refine mode)', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: okArgs }] })
    await new AnthropicAdapter().refineEstimate({
      existingEstimate: okArgs as never,
      instruction: 'x',
      priceBookItems: [],
    })
    const s = shape(mockAnthropicCreate.mock.calls[0][0].tools[0].input_schema)
    expect(s.top).toEqual(expect.arrayContaining(TOP_KEYS))
    expect(s.item).toEqual(expect.arrayContaining(ITEM_KEYS))
  })

  it('gemini (generate mode)', async () => {
    mockGeminiGenerate.mockResolvedValueOnce({ functionCalls: [{ name: 'create_estimate', args: okArgs }] })
    await new GeminiAdapter().generateEstimate(baseInput)
    const decl = mockGeminiGenerate.mock.calls[0][0].config.tools[0].functionDeclarations[0]
    const s = shape(decl.parameters)
    expect(s.top).toEqual(expect.arrayContaining(TOP_KEYS))
    expect(s.section).toEqual(expect.arrayContaining(SECTION_KEYS))
    expect(s.item).toEqual(expect.arrayContaining(ITEM_KEYS))
    expect(s.questionKeys).toEqual(['question', 'impact'])
  })

  it('gemini (refine mode)', async () => {
    mockGeminiGenerate.mockResolvedValueOnce({ functionCalls: [{ name: 'create_estimate', args: okArgs }] })
    await new GeminiAdapter().refineEstimate({
      existingEstimate: okArgs as never,
      instruction: 'x',
      priceBookItems: [],
    })
    const decl = mockGeminiGenerate.mock.calls[0][0].config.tools[0].functionDeclarations[0]
    const s = shape(decl.parameters)
    expect(s.top).toEqual(expect.arrayContaining(TOP_KEYS))
    expect(s.item).toEqual(expect.arrayContaining(ITEM_KEYS))
  })

  it('none of the new fields is required (additive contract)', () => {
    const schema = estimateToolSchema as unknown as Schema & { required: string[] }
    for (const key of TOP_KEYS) expect(schema.required).not.toContain(key)
    const item = schema.properties.sections.items.properties.items.items
    for (const key of ITEM_KEYS) expect(item.required).not.toContain(key)
  })

  it('the unit description names the closed list', () => {
    const schema = estimateToolSchema as unknown as Schema
    const unit = schema.properties.sections.items.properties.items.items.properties.unit
    for (const u of CANONICAL_UNITS) expect(unit.description).toContain(u)
  })
})

describe('unit normaliser', () => {
  it.each([
    ['sqft', 'sq ft'],
    ['SQ. FT.', 'sq ft'],
    ['square feet', 'sq ft'],
    ['hrs', 'hour'],
    ['Hr', 'hour'],
    ['lf', 'linear ft'],
    ['linear feet', 'linear ft'],
    ['ea', 'each'],
    ['cy', 'cu yd'],
    ['days', 'day'],
    ['lump sum', 'job'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected)
  })

  it('keeps unknown units as written (trimmed): the closed list guides, it never rejects', () => {
    expect(normalizeUnit('  m2 ')).toBe('m2')
    expect(normalizeUnit('horas')).toBe('horas')
    expect(normalizeUnit('gal')).toBe('gal')
    expect(normalizeUnit('')).toBe('')
  })

  it('unitKey folds synonyms and lowercases unknown units', () => {
    expect(unitKey('SqFt')).toBe('sq ft')
    expect(unitKey('Gal')).toBe('gal')
    expect(unitKey(null)).toBe('')
  })
})

describe('zod gate stays tolerant', () => {
  const base = () => ({
    suggested_project_name: 'P',
    summary: 'S',
    sections: [{ title: 'T', items: [{ description: 'd', quantity: 1, unit: 'sqft', unit_price: 5, price_source: 'ai_estimate' }] }],
  })

  it('a legacy output (none of the v2 fields) parses, and units are normalised', () => {
    const r = estimateOutputSchema.safeParse(base())
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.sections[0].items[0].unit).toBe('sq ft')
      expect(r.data.assumptions).toBeUndefined()
      expect(r.data.open_questions).toBeUndefined()
    }
  })

  it('accepts a full v2 output', () => {
    const raw = {
      ...base(),
      assumptions: ['Standard 8 ft ceilings', 'Standard 8 ft ceilings', '  '],
      exclusions: ['Permit fees'],
      open_questions: [{ question: 'Is the garage included?', impact: 'high' }, 'Any HOA rules?'],
      scope_confidence: 'medium',
    }
    ;(raw.sections[0] as Record<string, unknown>).purpose = 'Interior walls'
    ;(raw.sections[0].items[0] as Record<string, unknown>).confidence = 'low'
    ;(raw.sections[0].items[0] as Record<string, unknown>).basis = 'from the 12x14 room stated in the audio'
    ;(raw.sections[0].items[0] as Record<string, unknown>).optional = true
    const r = estimateOutputSchema.safeParse(raw)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.assumptions).toEqual(['Standard 8 ft ceilings'])
      expect(r.data.exclusions).toEqual(['Permit fees'])
      expect(r.data.open_questions).toEqual([
        { question: 'Is the garage included?', impact: 'high' },
        { question: 'Any HOA rules?', impact: 'medium' },
      ])
      expect(r.data.scope_confidence).toBe('medium')
      const item = r.data.sections[0].items[0]
      expect(item.confidence).toBe('low')
      expect(item.basis).toBe('from the 12x14 room stated in the audio')
      expect(item.optional).toBe(true)
    }
  })

  it('garbage in the v2 fields is dropped, never rejected', () => {
    const raw = {
      ...base(),
      assumptions: 'not a list',
      exclusions: [1, null, {}],
      open_questions: { nope: true },
      scope_confidence: 'enormous',
    }
    ;(raw.sections[0].items[0] as Record<string, unknown>).confidence = 'certain'
    ;(raw.sections[0].items[0] as Record<string, unknown>).basis = 42
    ;(raw.sections[0].items[0] as Record<string, unknown>).optional = 'yes'
    const r = estimateOutputSchema.safeParse(raw)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.assumptions).toBeUndefined()
      expect(r.data.exclusions).toBeUndefined()
      expect(r.data.open_questions).toBeUndefined()
      expect(r.data.scope_confidence).toBeUndefined()
      const item = r.data.sections[0].items[0]
      expect(item.confidence).toBeUndefined()
      expect(item.basis).toBeUndefined()
      expect(item.optional).toBeUndefined()
    }
  })

  it('caps the lists', () => {
    const raw = {
      ...base(),
      assumptions: Array.from({ length: 30 }, (_, i) => `a${i}`),
      open_questions: Array.from({ length: 20 }, (_, i) => `q${i}`),
    }
    const r = estimateOutputSchema.safeParse(raw)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.assumptions).toHaveLength(12)
      expect(r.data.open_questions).toHaveLength(8)
    }
  })
})
