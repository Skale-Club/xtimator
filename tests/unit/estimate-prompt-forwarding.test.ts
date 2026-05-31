import { describe, expect, it } from 'vitest'
import { buildUserContent } from '@/lib/ai/prompt-builder'
import type { EstimateInput } from '@/lib/ai/types'

const baseInput: EstimateInput = {
  industry: 'painting',
  projectName: 'Test project',
  projectType: null,
  targetBudget: null,
  clientName: null,
  clientAddress: null,
  transcripts: [],
  photoDescriptions: [],
  priceBookItems: [],
  currencyCode: 'USD',
  defaultPaymentTerms: null,
  defaultWarrantyTerms: null,
}

describe('Phase 89 deferral closed — prompt forwarding to AI prompt builder', () => {
  it('renders a "## Description" section when prompts is provided', () => {
    const content = buildUserContent({
      ...baseInput,
      prompts: ['build a deck 12x14 ft cedar with railing'],
    })
    expect(content).toMatch(/## Description/)
    expect(content).toMatch(/build a deck 12x14 ft cedar with railing/)
  })

  it('wraps each prompt in its own delimiter tag (S06 injection hardening)', () => {
    const content = buildUserContent({
      ...baseInput,
      prompts: ['first prompt', 'second prompt', 'third prompt'],
    })
    expect(content).toContain(
      '<description>first prompt</description>\n' +
        '<description>second prompt</description>\n' +
        '<description>third prompt</description>'
    )
  })

  it('omits the Description section when prompts is undefined', () => {
    const content = buildUserContent({ ...baseInput })
    expect(content).not.toMatch(/## Description/)
  })

  it('omits the Description section when prompts is an empty array', () => {
    const content = buildUserContent({ ...baseInput, prompts: [] })
    expect(content).not.toMatch(/## Description/)
  })

  it('renders all three modalities when transcripts + photoDescriptions + prompts are all present', () => {
    const content = buildUserContent({
      ...baseInput,
      transcripts: ['Audio note: kitchen remodel'],
      photoDescriptions: ['Photo 1: countertop closeup'],
      prompts: ['budget around $5000'],
    })
    expect(content).toMatch(/## Audio Transcripts/)
    expect(content).toMatch(/## Photo Descriptions/)
    expect(content).toMatch(/## Description/)
    // Order matters for the prompt — transcripts first, photos middle, prompts last
    const tIdx = content.indexOf('## Audio Transcripts')
    const pIdx = content.indexOf('## Photo Descriptions')
    const dIdx = content.indexOf('## Description')
    expect(tIdx).toBeLessThan(pIdx)
    expect(pIdx).toBeLessThan(dIdx)
  })
})

describe('Phase 89 deferral closed — static contract on the forwarding chain', () => {
  it('lib/mcp/tools/write.ts forwards args.prompt into the Inngest payload as prompts: [prompt]', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(__dirname, '../../lib/mcp/tools/write.ts'),
      'utf8',
    )
    expect(src).toMatch(/prompts:\s*\[\s*input\.prompt\s*\]/)
  })

  it('lib/inngest/functions/generate-estimate.ts destructures `prompts` from event.data and forwards to the service', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(__dirname, '../../lib/inngest/functions/generate-estimate.ts'),
      'utf8',
    )
    expect(src).toMatch(/\bprompts\b/)
    expect(src).toMatch(/prompts:\s*prompts/)
  })

  it('lib/services/generate-estimate.ts accepts `prompts` in GenerateEstimateOptions', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(__dirname, '../../lib/services/generate-estimate.ts'),
      'utf8',
    )
    expect(src).toMatch(/prompts\?:\s*string\[\]/)
    // Service loosens the "at least one input" precondition: prompts also satisfies it
    expect(src).toMatch(/hasPrompts/)
    expect(src).toMatch(/transcript,\s+photo,\s+or\s+prompt/i)
  })

  it('lib/inngest/events.ts adds `prompts` to EstimateGeneratePayload', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(__dirname, '../../lib/inngest/events.ts'),
      'utf8',
    )
    expect(src).toMatch(/EstimateGeneratePayload\s*=\s*\{[\s\S]*prompts\?:\s*string\[\]/)
  })

  it('lib/ai/types.ts adds optional `prompts` to EstimateInput', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(__dirname, '../../lib/ai/types.ts'),
      'utf8',
    )
    expect(src).toMatch(/prompts\?:\s*string\[\]/)
  })
})
