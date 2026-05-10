import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/schemas/custom-domain', () => ({
  customDomainSchema: { safeParse: vi.fn() },
}))

describe('customDomainSchema', () => {
  it('accepts valid subdomain estimates.mycompany.com', () => {
    expect.fail('not implemented')
  })

  it('accepts apex domain mycompany.com', () => {
    expect.fail('not implemented')
  })

  it('rejects https://estimates.mycompany.com (protocol prefix)', () => {
    expect.fail('not implemented')
  })

  it('accepts empty string (clearing the domain)', () => {
    expect.fail('not implemented')
  })
})
