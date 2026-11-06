import { describe, expect, it } from 'vitest'
import { buildEstimateToolSchema, estimateToolSchema } from '@/lib/ai/providers/openrouter'
import { omittedEstimateFields, shapeEstimateToolSchema } from '@/lib/ai/tool-schema'
import { buildSystemPrompt, documentBlocksPrompt } from '@/lib/ai/prompt-builder'
import { estimateOutputSchema } from '@/lib/ai/schema'
import type { EstimateInput } from '@/lib/ai/types'

// SEED-056 Phase C: generate mode never lets the model author payment /
// warranty text, and offers timeline / notes only when the company turned the
// block on. Refine keeps the full schema. The zod schema stays permissive.

const keys = (s: { properties: Record<string, unknown> }) => Object.keys(s.properties)

describe('generate-mode tool schema', () => {
  it('has no payment_terms / warranty_terms key, whatever the flags', () => {
    for (const aiBlocks of [undefined, { timeline: false, notes: false }, { timeline: true, notes: true }]) {
      const props = keys(buildEstimateToolSchema({ mode: 'generate', aiBlocks }))
      expect(props).not.toContain('payment_terms')
      expect(props).not.toContain('warranty_terms')
    }
  })

  it('drops timeline and notes when the blocks are off or unspecified', () => {
    for (const aiBlocks of [undefined, { timeline: false, notes: false }]) {
      const props = keys(buildEstimateToolSchema({ mode: 'generate', aiBlocks }))
      expect(props).not.toContain('timeline')
      expect(props).not.toContain('notes')
    }
  })

  it('offers each of timeline / notes independently when its block is on', () => {
    const onlyTimeline = keys(buildEstimateToolSchema({ mode: 'generate', aiBlocks: { timeline: true, notes: false } }))
    expect(onlyTimeline).toContain('timeline')
    expect(onlyTimeline).not.toContain('notes')
    const onlyNotes = keys(buildEstimateToolSchema({ mode: 'generate', aiBlocks: { timeline: false, notes: true } }))
    expect(onlyNotes).toContain('notes')
    expect(onlyNotes).not.toContain('timeline')
  })

  it('keeps the core fields and the required list', () => {
    const schema = buildEstimateToolSchema({ mode: 'generate' })
    expect(keys(schema)).toEqual(
      expect.arrayContaining(['suggested_project_name', 'detected_trade', 'summary', 'sections']),
    )
    expect(schema.required).toEqual(estimateToolSchema.required)
  })

  it('never mutates the shared full schema', () => {
    buildEstimateToolSchema({ mode: 'generate' })
    expect(keys(estimateToolSchema)).toEqual(
      expect.arrayContaining(['payment_terms', 'warranty_terms', 'timeline', 'notes']),
    )
  })
})

describe('refine-mode tool schema', () => {
  it('keeps the full schema', () => {
    const schema = buildEstimateToolSchema({ mode: 'refine' })
    expect(keys(schema)).toEqual(
      expect.arrayContaining(['payment_terms', 'warranty_terms', 'timeline', 'notes']),
    )
  })

  it('omits nothing', () => {
    expect(omittedEstimateFields({ mode: 'refine' })).toEqual([])
  })
})

describe('shapeEstimateToolSchema is adapter-agnostic', () => {
  it('works on any {properties} object (Gemini / Anthropic shapes)', () => {
    const shaped = shapeEstimateToolSchema(
      { type: 'object', properties: { summary: {}, timeline: {}, notes: {}, payment_terms: {}, warranty_terms: {} } },
      { mode: 'generate', aiBlocks: { timeline: true, notes: false } },
    )
    expect(Object.keys(shaped.properties)).toEqual(['summary', 'timeline'])
  })
})

describe('zod output schema stays permissive (cached / legacy outputs still parse)', () => {
  it('accepts an output with and without the document-block fields', () => {
    const base = { suggested_project_name: 'x', summary: 's', sections: [] }
    expect(estimateOutputSchema.safeParse(base).success).toBe(true)
    expect(
      estimateOutputSchema.safeParse({
        ...base,
        notes: 'n',
        timeline: 't',
        payment_terms: 'p',
        warranty_terms: 'w',
      }).success,
    ).toBe(true)
  })
})

const input: EstimateInput = {
  industry: 'plumbing',
  projectName: 'P',
  projectType: null,
  targetBudget: null,
  clientName: null,
  clientAddress: null,
  transcripts: [],
  photoDescriptions: [],
  priceBookItems: [],
}

describe('Document blocks prompt paragraph', () => {
  it('generate mode: forbids payment / warranty and omits timeline / notes when off', () => {
    const prompt = buildSystemPrompt({ ...input, aiBlocks: { timeline: false, notes: false } })
    expect(prompt).toContain('## Document blocks')
    expect(prompt).toContain('Do not write payment terms or warranty terms')
    expect(prompt).toContain('Omit the timeline field.')
    expect(prompt).toContain('Omit the notes field.')
  })

  it('generate mode: guides timeline / notes when on', () => {
    const prompt = buildSystemPrompt({ ...input, aiBlocks: { timeline: true, notes: true } })
    expect(prompt).toContain('Write a timeline only if the source material states dates or durations')
    expect(prompt).toContain('Write notes only for assumptions the client must know')
    expect(prompt).not.toContain('Omit the timeline field.')
  })

  it('refine mode gets no such paragraph', () => {
    expect(buildSystemPrompt(input, { mode: 'refine' })).not.toContain('## Document blocks')
  })

  it('snapshot of the paragraph for both flag states', () => {
    expect(documentBlocksPrompt({ timeline: false, notes: false })).toMatchInlineSnapshot(`
      "## Document blocks
      Do not write payment terms or warranty terms; the company's own text is attached automatically.
      Omit the timeline field.
      Omit the notes field."
    `)
    expect(documentBlocksPrompt({ timeline: true, notes: true })).toMatchInlineSnapshot(`
      "## Document blocks
      Do not write payment terms or warranty terms; the company's own text is attached automatically.
      Write a timeline only if the source material states dates or durations; otherwise omit it.
      Write notes only for assumptions the client must know; otherwise omit them."
    `)
  })
})
