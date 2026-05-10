import { describe, it, expect } from 'vitest'
import { customDomainSchema } from '@/lib/schemas/custom-domain'

describe('customDomainSchema', () => {
  it('accepts valid subdomain estimates.mycompany.com', () => {
    const result = customDomainSchema.safeParse({ custom_domain: 'estimates.mycompany.com' })
    expect(result.success).toBe(true)
  })

  it('accepts apex domain mycompany.com', () => {
    const result = customDomainSchema.safeParse({ custom_domain: 'mycompany.com' })
    expect(result.success).toBe(true)
  })

  it('rejects https://estimates.mycompany.com (protocol prefix)', () => {
    const result = customDomainSchema.safeParse({ custom_domain: 'https://estimates.mycompany.com' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('No http://')
    }
  })

  it('accepts empty string (clearing the domain)', () => {
    const result = customDomainSchema.safeParse({ custom_domain: '' })
    expect(result.success).toBe(true)
  })
})
