import { describe, it, expect } from 'vitest'
import { serializePhotoContext } from '@/lib/estimate/photo-context'
import { buildUserContent } from '@/lib/ai/prompt-builder'
import type { EstimateInput } from '@/lib/ai/types'

/**
 * PEXT-02 — pure serializer that turns one photo row (ai_description +
 * caption + optional ai_extraction) into the single string fed to
 * `photoDescriptions` (lib/services/generate-estimate.ts).
 *
 * Byte-identity contract (case a/b): when `ai_extraction` is null/absent —
 * every legacy photo, every fallback, kill-switch mode — the output MUST be
 * IDENTICAL to today's 168-02 format ('Photo N (caption: X): desc' /
 * 'Photo N: desc'). tests/unit/services/generate-estimate-captions.test.ts
 * locks this same contract at the service level and stays green UNMODIFIED.
 */

describe('serializePhotoContext — null-extraction byte-identity (168-02 format)', () => {
  it('(a) null extraction + caption -> byte-identical "Photo N (caption: X): desc"', () => {
    const result = serializePhotoContext(
      { ai_description: 'Kitchen with damaged cabinets', caption: 'north wall, 12ft ceiling', ai_extraction: null },
      0
    )
    expect(result).toBe('Photo 1 (caption: north wall, 12ft ceiling): Kitchen with damaged cabinets')
  })

  it('(a) caption is trimmed exactly like the current caption?.trim() branch', () => {
    const result = serializePhotoContext(
      { ai_description: 'Kitchen with damaged cabinets', caption: '  north wall  ', ai_extraction: null },
      0
    )
    expect(result).toBe('Photo 1 (caption: north wall): Kitchen with damaged cabinets')
  })

  it('(b) null extraction, no caption -> byte-identical "Photo N: desc"', () => {
    const result = serializePhotoContext(
      { ai_description: 'Kitchen with damaged cabinets', caption: null, ai_extraction: null },
      0
    )
    expect(result).toBe('Photo 1: Kitchen with damaged cabinets')
  })

  it('(b) empty/whitespace-only caption falls into the no-caption branch', () => {
    const result = serializePhotoContext(
      { ai_description: 'Kitchen with damaged cabinets', caption: '   ', ai_extraction: null },
      0
    )
    expect(result).toBe('Photo 1: Kitchen with damaged cabinets')
  })

  it('index is the post-filter index (Photo N uses i+1, not any stored sort_order)', () => {
    const result = serializePhotoContext(
      { ai_description: 'Exterior wall damage', caption: null, ai_extraction: null },
      3
    )
    expect(result).toBe('Photo 4: Exterior wall damage')
  })

  it('ai_description is used RAW/untrimmed (no serializer-side trimming of the description itself)', () => {
    const result = serializePhotoContext(
      { ai_description: '  Kitchen with damaged cabinets  ', caption: null, ai_extraction: null },
      0
    )
    expect(result).toBe('Photo 1:   Kitchen with damaged cabinets  ')
  })

  it('ai_extraction absent (undefined, not even present on the object) behaves identically to null', () => {
    const result = serializePhotoContext(
      { ai_description: 'Kitchen with damaged cabinets', caption: null },
      0
    )
    expect(result).toBe('Photo 1: Kitchen with damaged cabinets')
  })
})

describe('serializePhotoContext — (c) full extraction: all sections in order, no dangling separators', () => {
  it('renders measurements, materials, and damage as compact " | " sections', () => {
    const result = serializePhotoContext(
      {
        ai_description: 'Tiled bathroom floor with cracked grout',
        caption: 'north wall',
        ai_extraction: {
          version: 1,
          surfaces: [],
          measurements: [
            { dimension: 'area', value: 220, unit: 'sq ft', subject: 'floor area', confidence: 'estimated' },
            { dimension: 'length', value: 60, unit: 'linear ft', subject: 'baseboard length', confidence: 'stated' },
          ],
          materials: ['ceramic tile', 'grout'],
          damage: [{ description: 'cracked grout near tub', severity: 'moderate' }],
          trade_signals: [],
          access_notes: null,
          overall_description: 'Tiled bathroom floor with cracked grout',
        },
      },
      1
    )

    expect(result).toBe(
      'Photo 2 (caption: north wall): Tiled bathroom floor with cracked grout' +
        ' | Measurements: floor area 220 sq ft (estimated); baseboard length 60 linear ft (stated)' +
        ' | Materials: ceramic tile, grout' +
        ' | Damage: cracked grout near tub (moderate)'
    )
  })

  it('includes trade_signals and access_notes compactly when present', () => {
    const result = serializePhotoContext(
      {
        ai_description: 'Roof with missing shingles',
        caption: null,
        ai_extraction: {
          version: 1,
          surfaces: [],
          measurements: [],
          materials: [],
          damage: [],
          trade_signals: ['roofing', 'exterior'],
          access_notes: 'steep pitch, ladder required',
          overall_description: 'Roof with missing shingles',
        },
      },
      0
    )

    expect(result).toBe(
      'Photo 1: Roof with missing shingles' +
        ' | Trade signals: roofing, exterior' +
        ' | Access: steep pitch, ladder required'
    )
  })

  it('does not leave a dangling " | " when the extraction has no sections at all', () => {
    const result = serializePhotoContext(
      {
        ai_description: 'Empty extraction case',
        caption: null,
        ai_extraction: {
          version: 1,
          surfaces: [],
          measurements: [],
          materials: [],
          damage: [],
          trade_signals: [],
          access_notes: null,
          overall_description: 'Empty extraction case',
        },
      },
      0
    )
    expect(result).toBe('Photo 1: Empty extraction case')
  })
})

describe('serializePhotoContext — (d) empty arrays omitted individually', () => {
  it('omits the Measurements section when measurements is empty but keeps Materials/Damage', () => {
    const result = serializePhotoContext(
      {
        ai_description: 'Wall with peeling paint',
        caption: null,
        ai_extraction: {
          version: 1,
          surfaces: [],
          measurements: [],
          materials: ['paint'],
          damage: [{ description: 'peeling paint', severity: 'minor' }],
          trade_signals: [],
          access_notes: null,
          overall_description: 'Wall with peeling paint',
        },
      },
      0
    )
    expect(result).toBe(
      'Photo 1: Wall with peeling paint | Materials: paint | Damage: peeling paint (minor)'
    )
  })
})

describe('serializePhotoContext — (e) measurement phrasing carries subject/value/unit/confidence', () => {
  it('a count-dimension measurement still carries subject + value + unit + confidence', () => {
    const result = serializePhotoContext(
      {
        ai_description: 'Windows needing replacement',
        caption: null,
        ai_extraction: {
          version: 1,
          surfaces: [],
          measurements: [
            { dimension: 'count', value: 3, unit: 'each', subject: 'windows', confidence: 'stated' },
          ],
          materials: [],
          damage: [],
          trade_signals: [],
          access_notes: null,
          overall_description: 'Windows needing replacement',
        },
      },
      0
    )
    expect(result).toBe(
      'Photo 1: Windows needing replacement | Measurements: windows 3 each (stated)'
    )
  })
})

describe('serializePhotoContext — (f) invalid stored JSONB -> prose-only output (safeParse guard), never throw', () => {
  it('a malformed ai_extraction object (fails safeParse) degrades to the prose-only format', () => {
    const result = serializePhotoContext(
      {
        ai_description: 'Kitchen with damaged cabinets',
        caption: 'north wall',
        // Missing overall_description -> fails photoExtractionSchema.safeParse
        ai_extraction: { version: 1, measurements: 'not-an-array' },
      },
      0
    )
    expect(result).toBe('Photo 1 (caption: north wall): Kitchen with damaged cabinets')
  })

  it('a completely wrong-shaped ai_extraction (string) never throws and degrades to prose-only', () => {
    expect(() =>
      serializePhotoContext(
        { ai_description: 'Kitchen with damaged cabinets', caption: null, ai_extraction: 'garbage-string' },
        0
      )
    ).not.toThrow()

    const result = serializePhotoContext(
      { ai_description: 'Kitchen with damaged cabinets', caption: null, ai_extraction: 'garbage-string' },
      0
    )
    expect(result).toBe('Photo 1: Kitchen with damaged cabinets')
  })
})

describe('end-to-end: a photo WITH extraction reaches buildUserContent sanitized exactly once', () => {
  const baseInput: EstimateInput = {
    industry: 'construction',
    projectName: 'Test Project',
    projectType: 'General',
    targetBudget: null,
    clientName: null,
    clientAddress: null,
    transcripts: [],
    photoDescriptions: [],
    priceBookItems: [],
    currencyCode: 'USD',
    defaultPaymentTerms: null,
    defaultWarrantyTerms: null,
    language: 'en',
  }

  it('the Measurements block is present inside <photo_description>, with injection-y content escaped exactly once', () => {
    const serialized = serializePhotoContext(
      {
        ai_description: 'Tiled bathroom floor with cracked grout',
        caption: null,
        ai_extraction: {
          version: 1,
          surfaces: [],
          measurements: [
            { dimension: 'area', value: 220, unit: 'sq ft', subject: 'floor area', confidence: 'estimated' },
          ],
          materials: ['<b>ceramic</b> tile & grout'],
          damage: [],
          trade_signals: [],
          access_notes: null,
          overall_description: 'Tiled bathroom floor with cracked grout',
        },
      },
      0
    )

    const content = buildUserContent({ ...baseInput, photoDescriptions: [serialized] })

    expect(content).toContain('<photo_description>')
    expect(content).toContain('Measurements: floor area 220 sq ft (estimated)')
    // Escaped exactly once by sanitizeField (prompt-builder.ts:159) — never by
    // the serializer itself (which emits raw text, per case (g) above).
    expect(content).toContain('Materials: &lt;b&gt;ceramic&lt;/b&gt; tile &amp; grout')
    expect(content).not.toContain('<b>ceramic</b>')
    // No double-escaping: a double-escape would render "&amp;lt;".
    expect(content).not.toContain('&amp;lt;')
  })
})

describe('serializePhotoContext — (g) raw output, no double-escaping (sanitizeField escapes downstream)', () => {
  it('injection-y content in extraction fields survives RAW into the string (not pre-escaped by the serializer)', () => {
    const result = serializePhotoContext(
      {
        ai_description: 'Wall photo',
        caption: null,
        ai_extraction: {
          version: 1,
          surfaces: [],
          measurements: [],
          materials: ['<script>alert(1)</script> & co'],
          damage: [],
          trade_signals: [],
          access_notes: null,
          overall_description: 'Wall photo',
        },
      },
      0
    )
    // Raw angle brackets/ampersand — NOT escaped here. sanitizeField
    // (prompt-builder.ts:159) is the ONE place escaping happens.
    expect(result).toBe('Photo 1: Wall photo | Materials: <script>alert(1)</script> & co')
    expect(result).not.toContain('&lt;')
    expect(result).not.toContain('&amp;')
  })
})
