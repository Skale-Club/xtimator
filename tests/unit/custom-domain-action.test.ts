import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/actions/custom-domain', () => ({
  saveCustomDomain: vi.fn(),
}))

describe('saveCustomDomain', () => {
  it('accepts valid hostname', () => {
    expect.fail('not implemented')
  })

  it('rejects hostname with https:// prefix', () => {
    expect.fail('not implemented')
  })

  it('stores null for empty string (clears domain)', () => {
    expect.fail('not implemented')
  })
})
