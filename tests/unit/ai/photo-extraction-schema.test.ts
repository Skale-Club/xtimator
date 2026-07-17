import { describe, it, expect } from 'vitest'
import {
  photoExtractionSchema,
  photoExtractionToolSchema,
  type PhotoExtraction,
} from '@/lib/ai/photo-extraction-schema'

/**
 * PEXT-01 — zod schema validation for structured photo extraction.
 *
 * `photoExtractionSchema` (`@/lib/ai/photo-extraction-schema`) is the
 * authoritative second gate over the provider structured-call JSON (171-02).
 * `PhotoExtraction = z.infer<typeof photoExtractionSchema>` so a static
 * import keeps `safeParse(...).data` strongly typed.
 *
 * The load-bearing contract under test: a malformed array ELEMENT is
 * dropped while its siblings survive (dropInvalid preprocess) — NOT the
 * whole array wiped by a bare `.catch([])`. `overall_description` missing
 * or empty is the ONE case that fails the whole parse.
 */

function validRaw(): Record<string, unknown> {
  return {
    version: 1,
    surfaces: [{ name: 'kitchen floor', material: 'vinyl plank', condition: 'worn' }],
    measurements: [
      { dimension: 'area', value: 120, unit: 'sq ft', subject: 'kitchen floor', confidence: 'stated' },
    ],
    materials: ['vinyl plank', 'drywall'],
    damage: [{ description: 'water stain near sink', severity: 'moderate' }],
    trade_signals: ['flooring'],
    access_notes: 'narrow hallway access',
    overall_description: 'Kitchen with worn vinyl plank flooring and a water stain near the sink.',
  }
}

describe('PEXT-01: photoExtractionSchema accepts valid output', () => {
  it('a fully-valid raw object parses successfully', () => {
    const result = photoExtractionSchema.safeParse(validRaw())
    expect(result.success).toBe(true)
  })

  it('round-trips through the PhotoExtraction type without drift', () => {
    const result = photoExtractionSchema.safeParse(validRaw())
    expect(result.success).toBe(true)
    if (!result.success) return
    const data: PhotoExtraction = result.data
    expect(data.overall_description.length).toBeGreaterThan(0)
  })
})

describe('PEXT-01: missing optional arrays default to []', () => {
  it('omitting surfaces/measurements/materials/damage/trade_signals still parses, defaulting to []', () => {
    const raw = { overall_description: 'A photo with no structured detail.' }
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.surfaces).toEqual([])
    expect(result.data.measurements).toEqual([])
    expect(result.data.materials).toEqual([])
    expect(result.data.damage).toEqual([])
    expect(result.data.trade_signals).toEqual([])
  })

  it('access_notes is optional and omitting it is fine', () => {
    const raw = validRaw()
    delete raw.access_notes
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })

  it('a non-array value on an array field (e.g. null) is treated as empty, not a parse failure', () => {
    const raw = validRaw()
    raw.measurements = null
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.measurements).toEqual([])
  })
})

describe('PEXT-01: element-drop discipline — malformed single element dropped, siblings kept', () => {
  it('a malformed single measurement (missing value) is dropped; a valid sibling measurement survives', () => {
    const raw = validRaw()
    raw.measurements = [
      { dimension: 'area', unit: 'sq ft', subject: 'kitchen floor' }, // missing `value` -> invalid
      { dimension: 'length', value: 10, unit: 'ft', subject: 'hallway', confidence: 'estimated' }, // valid
    ]
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.measurements).toHaveLength(1)
    expect(result.data.measurements[0].subject).toBe('hallway')
  })

  it('a measurement with an invalid dimension enum is dropped; siblings with a valid dimension survive', () => {
    const raw = validRaw()
    raw.measurements = [
      { dimension: 'volume', value: 5, unit: 'cu ft', subject: 'closet' }, // 'volume' not in enum -> invalid
      { dimension: 'count', value: 3, unit: 'each', subject: 'windows', confidence: 'stated' }, // valid
    ]
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.measurements).toHaveLength(1)
    expect(result.data.measurements[0].subject).toBe('windows')
  })

  it('a non-string material entry is dropped while valid string materials survive', () => {
    const raw = validRaw()
    raw.materials = ['vinyl plank', 42, '']
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.materials).toEqual(['vinyl plank'])
  })

  it('a damage entry missing description is dropped; a valid sibling damage entry survives', () => {
    const raw = validRaw()
    raw.damage = [
      { severity: 'severe' }, // missing description -> invalid
      { description: 'cracked tile', severity: 'minor' }, // valid
    ]
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.damage).toHaveLength(1)
    expect(result.data.damage[0].description).toBe('cracked tile')
  })
})

describe('PEXT-01: overall_description is the one hard requirement', () => {
  it('a missing overall_description fails the whole parse', () => {
    const raw = validRaw()
    delete raw.overall_description
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })

  it('an empty overall_description fails the whole parse', () => {
    const raw = validRaw()
    raw.overall_description = ''
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })
})

describe('PEXT-01: field-level defensive coercions (enum drift, not element drop)', () => {
  it('an unrecognized confidence value coerces to "estimated" without dropping the measurement', () => {
    const raw = validRaw()
    raw.measurements = [
      { dimension: 'area', value: 120, unit: 'sq ft', subject: 'kitchen floor', confidence: 'guessed' },
    ]
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.measurements).toHaveLength(1)
    expect(result.data.measurements[0].confidence).toBe('estimated')
  })

  it('a missing confidence defaults to "estimated"', () => {
    const raw = validRaw()
    raw.measurements = [{ dimension: 'area', value: 120, unit: 'sq ft', subject: 'kitchen floor' }]
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.measurements[0].confidence).toBe('estimated')
  })

  it('an unrecognized damage severity coerces to "moderate" without dropping the entry', () => {
    const raw = validRaw()
    raw.damage = [{ description: 'unclear crack pattern', severity: 'catastrophic' }]
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.damage[0].severity).toBe('moderate')
  })

  it('version absent defaults to 1', () => {
    const raw = validRaw()
    delete raw.version
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.version).toBe(1)
  })

  it('a garbage version value still coerces to 1 (never rejects the parse)', () => {
    const raw = validRaw()
    raw.version = 2
    const result = photoExtractionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.version).toBe(1)
  })
})

describe('PEXT-04 foundation: photoExtractionToolSchema parity with the zod shape', () => {
  const toolSchema = photoExtractionToolSchema() as {
    type: string
    required: string[]
    properties: Record<string, { type: string; enum?: string[] }>
  }

  it('is exported so it can be statically imported by future provider adapters/tests', () => {
    expect(toolSchema).toBeDefined()
    expect(toolSchema.properties).toBeDefined()
  })

  it('required is exactly [overall_description]', () => {
    expect(toolSchema.required).toEqual(['overall_description'])
  })

  it('the tool-schema property keys === the zod shape top-level keys', () => {
    const zodKeys = Object.keys(photoExtractionSchema.shape).sort()
    const toolKeys = Object.keys(toolSchema.properties).sort()
    expect(toolKeys).toEqual(zodKeys)
  })

  it('the dimension enum matches the zod measurement dimension enum exactly', () => {
    const dimensionSchema = toolSchema.properties.measurements as unknown as {
      items: { properties: { dimension: { enum: string[] } } }
    }
    expect(dimensionSchema.items.properties.dimension.enum).toEqual([
      'length',
      'area',
      'height',
      'count',
    ])
  })

  it('the confidence enum matches the zod measurement confidence enum exactly', () => {
    const confidenceSchema = toolSchema.properties.measurements as unknown as {
      items: { properties: { confidence: { enum: string[] } } }
    }
    expect(confidenceSchema.items.properties.confidence.enum).toEqual(['stated', 'estimated'])
  })

  it('the severity enum matches the zod damage severity enum exactly', () => {
    const severitySchema = toolSchema.properties.damage as unknown as {
      items: { properties: { severity: { enum: string[] } } }
    }
    expect(severitySchema.items.properties.severity.enum).toEqual(['minor', 'moderate', 'severe'])
  })
})
