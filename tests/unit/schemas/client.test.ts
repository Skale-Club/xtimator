import { describe, it, expect } from 'vitest'
import { clientSchema } from '@/lib/schemas/client'

describe('clientSchema', () => {
  it('valid client with only name passes validation', () => {
    const result = clientSchema.safeParse({ name: 'Acme Corp' })
    expect(result.success).toBe(true)
  })

  it('empty name fails validation with "Client name is required"', () => {
    const result = clientSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find((i) => i.path.includes('name'))
      expect(nameError?.message).toBe('Client name is required')
    }
  })

  it('invalid email format fails validation', () => {
    const result = clientSchema.safeParse({ name: 'Test', email: 'not-an-email' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const emailError = result.error.issues.find((i) => i.path.includes('email'))
      expect(emailError?.message).toBe('Invalid email')
    }
  })

  it('empty string email passes validation (optional field)', () => {
    const result = clientSchema.safeParse({ name: 'Test', email: '' })
    expect(result.success).toBe(true)
  })

  it('all optional fields can be empty strings', () => {
    const result = clientSchema.safeParse({
      name: 'Test',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      notes: '',
    })
    expect(result.success).toBe(true)
  })

  it('full valid client with all fields passes validation', () => {
    const result = clientSchema.safeParse({
      name: 'Acme Corp',
      email: 'info@acme.com',
      phone: '555-1234',
      address: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '90210',
      notes: 'Key client, prefers morning calls.',
    })
    expect(result.success).toBe(true)
  })
})
