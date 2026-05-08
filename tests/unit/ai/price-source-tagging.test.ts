import { describe, it } from 'vitest'
// normalizeOutput is created in Wave 1 (lib/ai/normalize.ts) and exported.
// This import is intentionally forward-referencing the Wave 1 artifact.
import { normalizeOutput } from '@/lib/ai/normalize'

describe('price_source tagging — defensive normalization', () => {
  it('matched item carries price_source price_book', () => {
    expect.fail('not implemented')
  })

  it('unmatched item carries price_source ai_estimate', () => {
    expect.fail('not implemented')
  })

  it('defensive fallback: undefined price_source becomes ai_estimate', () => {
    expect.fail('not implemented')
  })
})
