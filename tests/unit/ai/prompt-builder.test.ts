import { describe, it, vi } from 'vitest'
import type { EstimateInput } from '@/lib/ai/types'

vi.mock('@/lib/ai/prompt-builder', () => ({
  buildSystemPrompt: vi.fn(),
  buildUserContent: vi.fn(),
}))

const baseInput: EstimateInput = {
  industry: 'plumbing',
  projectName: 'Test Project',
  projectType: null,
  targetBudget: null,
  clientName: 'John Smith',
  clientAddress: null,
  transcripts: ['Replace water heater'],
  photoDescriptions: [],
  priceBookItems: [],
  defaultPaymentTerms: null,
  defaultWarrantyTerms: null,
}

describe('buildSystemPrompt — price book injection', () => {
  it('no price book items → system prompt has no price book section', () => {
    expect.fail('not implemented')
  })

  it('price book items present → system prompt contains compact list format', () => {
    expect.fail('not implemented')
  })

  it('price book items present → system prompt contains explicit matching instruction', () => {
    expect.fail('not implemented')
  })
})
