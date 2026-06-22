import { describe, it, expect } from 'vitest'
import {
  onboardingSchema,
  STEP_FIELDS,
  type OnboardingValues,
} from '@/lib/schemas/onboarding'

describe('onboardingSchema', () => {
  describe('step 1', () => {
    it('companyName is required and rejects empty string', () => {
      const result = onboardingSchema.safeParse({ companyName: '' })
      expect(result.success).toBe(false)
    })

    it('companyName rejects single character', () => {
      const result = onboardingSchema.safeParse({ companyName: 'A' })
      expect(result.success).toBe(false)
    })

    it('companyName accepts 2+ characters', () => {
      const result = onboardingSchema.safeParse({ companyName: 'AB' })
      expect(result.success).toBe(true)
    })

    it('ownerName is optional (accepts empty string and undefined)', () => {
      const withEmpty = onboardingSchema.safeParse({
        companyName: 'Test Co',
        ownerName: '',
      })
      expect(withEmpty.success).toBe(true)

      const withUndefined = onboardingSchema.safeParse({
        companyName: 'Test Co',
      })
      expect(withUndefined.success).toBe(true)
    })

    it('phone is optional (accepts empty string and undefined)', () => {
      const withEmpty = onboardingSchema.safeParse({
        companyName: 'Test Co',
        phone: '',
      })
      expect(withEmpty.success).toBe(true)
    })

    it('email is optional but validates format when non-empty', () => {
      const invalid = onboardingSchema.safeParse({
        companyName: 'Test Co',
        email: 'not-an-email',
      })
      expect(invalid.success).toBe(false)

      const valid = onboardingSchema.safeParse({
        companyName: 'Test Co',
        email: 'test@example.com',
      })
      expect(valid.success).toBe(true)
    })

    it('email accepts empty string', () => {
      const result = onboardingSchema.safeParse({
        companyName: 'Test Co',
        email: '',
      })
      expect(result.success).toBe(true)
    })

    it('website is optional but validates URL format when non-empty', () => {
      const invalid = onboardingSchema.safeParse({
        companyName: 'Test Co',
        website: 'not-a-url',
      })
      expect(invalid.success).toBe(false)

      const valid = onboardingSchema.safeParse({
        companyName: 'Test Co',
        website: 'https://example.com',
      })
      expect(valid.success).toBe(true)
    })

    it('website accepts empty string', () => {
      const result = onboardingSchema.safeParse({
        companyName: 'Test Co',
        website: '',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('step 2', () => {
    it('industries defaults to an empty array', () => {
      const result = onboardingSchema.safeParse({ companyName: 'Test Co' })
      expect(result.success).toBe(true)
      expect(result.data?.industries).toEqual([])
    })

    it('industries accepts multiple selected services', () => {
      const result = onboardingSchema.safeParse({
        companyName: 'Test Co',
        industries: ['house_cleaning', 'window_cleaning'],
      })
      expect(result.success).toBe(true)
      expect(result.data?.industries).toEqual(['house_cleaning', 'window_cleaning'])
    })

    it('customIndustries defaults to an empty array', () => {
      const result = onboardingSchema.safeParse({ companyName: 'Test Co' })
      expect(result.success).toBe(true)
      expect(result.data?.customIndustries).toEqual([])
    })

    it('prefillPriceBook defaults to false', () => {
      const result = onboardingSchema.safeParse({ companyName: 'Test Co' })
      expect(result.success).toBe(true)
      expect(result.data?.prefillPriceBook).toBe(false)
    })

    it('brandPrimaryColor defaults to "#406EF1"', () => {
      const result = onboardingSchema.safeParse({ companyName: 'Test Co' })
      expect(result.success).toBe(true)
      expect(result.data?.brandPrimaryColor).toBe('#406EF1')
    })
  })

  describe('step 3', () => {
    it('defaultTaxRate is number 0-100, defaults to 0', () => {
      const defaultResult = onboardingSchema.safeParse({
        companyName: 'Test Co',
      })
      expect(defaultResult.success).toBe(true)
      expect(defaultResult.data?.defaultTaxRate).toBe(0)

      const tooHigh = onboardingSchema.safeParse({
        companyName: 'Test Co',
        defaultTaxRate: 101,
      })
      expect(tooHigh.success).toBe(false)

      const negative = onboardingSchema.safeParse({
        companyName: 'Test Co',
        defaultTaxRate: -1,
      })
      expect(negative.success).toBe(false)
    })

    it('defaultPaymentTerms defaults to "Net 30"', () => {
      const result = onboardingSchema.safeParse({ companyName: 'Test Co' })
      expect(result.success).toBe(true)
      expect(result.data?.defaultPaymentTerms).toBe('Net 30')
    })

    it('defaultWarrantyTerms defaults to "1 year"', () => {
      const result = onboardingSchema.safeParse({ companyName: 'Test Co' })
      expect(result.success).toBe(true)
      expect(result.data?.defaultWarrantyTerms).toBe('1 year')
    })

    it('defaultValidityDays defaults to 30', () => {
      const result = onboardingSchema.safeParse({ companyName: 'Test Co' })
      expect(result.success).toBe(true)
      expect(result.data?.defaultValidityDays).toBe(30)
    })

    it('address, city, state, zip, licenseNumber, insuranceInfo are all optional', () => {
      const result = onboardingSchema.safeParse({ companyName: 'Test Co' })
      expect(result.success).toBe(true)
      expect(result.data?.address).toBe('')
      expect(result.data?.city).toBe('')
      expect(result.data?.state).toBe('')
      expect(result.data?.zip).toBe('')
      expect(result.data?.licenseNumber).toBe('')
      expect(result.data?.insuranceInfo).toBe('')
    })
  })

  describe('skip', () => {
    it('schema validates with only companyName provided (all others use defaults)', () => {
      const result = onboardingSchema.safeParse({ companyName: 'My Company' })
      expect(result.success).toBe(true)
      const data = result.data!
      expect(data.companyName).toBe('My Company')
      expect(data.ownerName).toBe('')
      expect(data.phone).toBe('')
      expect(data.email).toBe('')
      expect(data.website).toBe('')
      expect(data.industries).toEqual([])
      expect(data.customIndustries).toEqual([])
      expect(data.prefillPriceBook).toBe(false)
      expect(data.brandPrimaryColor).toBe('#406EF1')
      expect(data.defaultTaxRate).toBe(0)
      expect(data.defaultPaymentTerms).toBe('Net 30')
      expect(data.defaultWarrantyTerms).toBe('1 year')
      expect(data.defaultValidityDays).toBe(30)
    })
  })

  describe('STEP_FIELDS', () => {
    it('step 1 contains exactly the right fields', () => {
      expect(STEP_FIELDS[1]).toEqual([
        'companyName',
        'subdomain',
        'ownerName',
        'phone',
        'email',
        'website',
      ])
    })

    it('step 2 contains exactly the right fields', () => {
      expect(STEP_FIELDS[2]).toEqual([
        'industries',
        'customIndustries',
        'prefillPriceBook',
        'brandPrimaryColor',
      ])
    })

    it('step 3 contains exactly the right fields', () => {
      expect(STEP_FIELDS[3]).toEqual([
        'address',
        'city',
        'state',
        'zip',
        'licenseNumber',
        'insuranceInfo',
        'defaultTaxRate',
        'defaultPaymentTerms',
        'defaultWarrantyTerms',
        'defaultValidityDays',
      ])
    })
  })
})
