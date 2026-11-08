import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEED-057 Phase A: the output contract v2 keys exist, with the same names, on
// the OpenRouter adapter's create_estimate tool (the only provider), and
// the zod gate stays tolerant of legacy and sloppy output.

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('test-key'),
}))

import { estimateToolSchema } from '@/lib/ai/providers/openrouter'
import { estimateOutputSchema } from '@/lib/ai/schema'
import { CANONICAL_UNITS, isMetricUnit, normalizeUnit, unitKey } from '@/lib/ai/units'
import type { EstimateInput } from '@/lib/ai/types'

const TOP_KEYS = ['assumptions', 'exclusions', 'open_questions', 'scope_confidence']
const SECTION_KEYS = ['purpose']
const ITEM_KEYS = ['confidence', 'basis', 'optional', 'price_key']

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

describe('output contract v2: the OpenRouter adapter carries the v2 keys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('openrouter (full schema)', () => {
    const s = shape(estimateToolSchema as unknown as Schema)
    expect(s.top).toEqual(expect.arrayContaining(TOP_KEYS))
    expect(s.section).toEqual(expect.arrayContaining(SECTION_KEYS))
    expect(s.item).toEqual(expect.arrayContaining(ITEM_KEYS))
    expect(s.questionKeys).toEqual(['question', 'impact'])
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

describe('output budget', () => {
  beforeEach(() => vi.clearAllMocks())

  it('openrouter allows 16384 output tokens for an estimate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { tool_calls: [{ function: { name: 'create_estimate', arguments: JSON.stringify(okArgs) } }] } }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { OpenRouterAdapter } = await import('@/lib/ai/providers/openrouter')
    await new OpenRouterAdapter('m').generateEstimate(baseInput)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).max_tokens).toBe(16384)
    vi.unstubAllGlobals()
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
    ['per sq ft', 'sq ft'],
    ['Per Hour', 'hour'],
    ['/hr', 'hour'],
    ['/ sq. ft.', 'sq ft'],
    ['per each', 'each'],
    ['unidade', 'each'],
    ['Unidades', 'each'],
    ['h', 'hour'],
    ['horas', 'hour'],
    ['diária', 'day'],
    ['días', 'day'],
    ['verba', 'job'],
    ['global', 'job'],
    ['empreitada', 'job'],
    ['serviço', 'job'],
    ['servicio', 'job'],
    ['pés quadrados', 'sq ft'],
    ['pé quadrado', 'sq ft'],
    ['pies cuadrados', 'sq ft'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected)
  })

  it('metric units are NEVER converted silently', () => {
    for (const u of ['m2', 'm²', 'm', 'kg']) {
      expect(normalizeUnit(u)).toBe(u)
      expect(isMetricUnit(u)).toBe(true)
    }
    expect(isMetricUnit('metros quadrados')).toBe(true)
    expect(isMetricUnit('sq ft')).toBe(false)
    expect(isMetricUnit('gal')).toBe(false)
    expect(isMetricUnit(null)).toBe(false)
  })

  it('keeps unknown units as written (trimmed): the closed list guides, it never rejects', () => {
    expect(normalizeUnit('  m2 ')).toBe('m2')
    expect(normalizeUnit('horas')).toBe('hour')
    expect(normalizeUnit('serviço')).toBe('job')
    expect(normalizeUnit('gal')).toBe('gal')
    expect(normalizeUnit('')).toBe('')
  })

  it('unitKey folds synonyms and lowercases unknown units', () => {
    expect(unitKey('SqFt')).toBe('sq ft')
    expect(unitKey('Gal')).toBe('gal')
    expect(unitKey(null)).toBe('')
    expect(unitKey('per sq ft')).toBe('sq ft')
    expect(unitKey('/hr')).toBe('hour')
    expect(unitKey('per')).toBe('per')
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

  it('keeps a valid price_key and drops a non-string one, never rejecting', () => {
    const ok = base()
    ;(ok.sections[0].items[0] as Record<string, unknown>).price_key = 'interior wall painting, two coats'
    const r1 = estimateOutputSchema.safeParse(ok)
    expect(r1.success).toBe(true)
    if (r1.success) expect(r1.data.sections[0].items[0].price_key).toBe('interior wall painting, two coats')

    const bad = base()
    ;(bad.sections[0].items[0] as Record<string, unknown>).price_key = 42
    const r2 = estimateOutputSchema.safeParse(bad)
    expect(r2.success).toBe(true)
    if (r2.success) expect(r2.data.sections[0].items[0].price_key).toBeUndefined()
  })

  it('truncates (never rejects) a basis longer than 80 characters', () => {
    const raw = base()
    ;(raw.sections[0].items[0] as Record<string, unknown>).basis = 'x'.repeat(300)
    const r = estimateOutputSchema.safeParse(raw)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.sections[0].items[0].basis).toHaveLength(80)
  })

  it('the tool description tells the model the 80 character limit', () => {
    const schema = estimateToolSchema as unknown as Schema
    expect(schema.properties.sections.items.properties.items.items.properties.basis.description).toContain('80')
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
