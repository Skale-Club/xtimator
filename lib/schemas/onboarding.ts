import { z } from 'zod'
import { SYSTEM_COLORS } from '@/lib/system-colors'

export const onboardingSchema = z.object({
  // Step 1: Business Information
  companyName: z
    .string()
    .min(2, 'Company name must be at least 2 characters'),
  ownerName: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z
    .string()
    .email('Please enter a valid email address')
    .optional()
    .or(z.literal(''))
    .default(''),
  website: z
    .string()
    .url('Please enter a valid website URL')
    .optional()
    .or(z.literal(''))
    .default(''),

  // Language preference (step 5 — after industry)
  language: z.enum(['en', 'pt', 'es']).optional().default('en'),

  // Step 2: Brand Identity
  industry: z.string().optional().default(''),
  customIndustry: z.string().optional().default(''),
  brandPrimaryColor: z.string().default(SYSTEM_COLORS.primary),

  // Step 3: Address & Defaults
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zip: z.string().optional().default(''),
  licenseNumber: z.string().optional().default(''),
  insuranceInfo: z.string().optional().default(''),
  defaultTaxRate: z.coerce
    .number()
    .min(0, 'Tax rate must be between 0 and 100')
    .max(100, 'Tax rate must be between 0 and 100')
    .default(0),
  defaultPaymentTerms: z.string().default('Net 30'),
  defaultWarrantyTerms: z.string().default('1 year'),
  defaultValidityDays: z.coerce.number().min(1).default(30),
})

export type OnboardingValues = z.infer<typeof onboardingSchema>
export type OnboardingInput = z.input<typeof onboardingSchema>

export const STEP_FIELDS: Record<number, (keyof OnboardingValues)[]> = {
  1: ['companyName', 'ownerName', 'phone', 'email', 'website'],
  2: ['industry', 'customIndustry', 'brandPrimaryColor'],
  3: [
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
  ],
}
