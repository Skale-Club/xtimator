import type { OnboardingValues } from '@/lib/schemas/onboarding'

export type SurveyStepKey =
  | 'companyName'
  | 'ownerName'
  | 'phone'
  | 'email'
  | 'industry'
  | 'brandColor'
  | 'logo'
  | 'location'
  | 'defaults'
  | 'review'

export interface SurveyStepDef {
  key: SurveyStepKey
  /** Question text shown as the step heading */
  label: string
  /** Optional helper text below the label */
  helper?: string
  /** When true, the Skip button is hidden and the step blocks Next on validation failure */
  required: boolean
  /** Returns an error message string, or null when the current values pass validation for this step. */
  validate: (values: OnboardingValues, logoFile: File | null) => string | null
}

function isValidEmail(v: string) {
  // simple RFC-5322-ish check, mirrors zod().email()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function isValidUrl(v: string) {
  try {
    new URL(v)
    return true
  } catch {
    return false
  }
}

export const SURVEY_STEPS: readonly SurveyStepDef[] = [
  {
    key: 'companyName',
    label: "What's your company name?",
    helper: 'This is the name customers will see on every estimate.',
    required: true,
    validate: (v) => {
      if (!v.companyName || v.companyName.trim().length < 2) {
        return 'Company name must be at least 2 characters'
      }
      return null
    },
  },
  {
    key: 'ownerName',
    label: "What's your name?",
    helper: 'Owner or primary contact for this business.',
    required: false,
    validate: () => null,
  },
  {
    key: 'phone',
    label: "What's the best phone number to reach you?",
    helper: 'Customers may use this on estimates and invoices.',
    required: false,
    validate: () => null,
  },
  {
    key: 'email',
    label: 'What email should appear on your estimates?',
    helper: 'Leave blank to use your account email.',
    required: false,
    validate: (v) => {
      if (v.email && v.email.trim() !== '' && !isValidEmail(v.email)) {
        return 'Please enter a valid email address'
      }
      return null
    },
  },
  {
    key: 'industry',
    label: 'Which industry best describes your business?',
    helper: 'We use this to tailor estimate templates.',
    required: false,
    validate: (v) => {
      if (v.industry === 'other' && (!v.customIndustry || v.customIndustry.trim() === '')) {
        return 'Please describe your industry'
      }
      return null
    },
  },
  {
    key: 'brandColor',
    label: 'Pick a brand color',
    helper: 'Used for accents on PDFs and shareable estimates.',
    required: false,
    validate: () => null,
  },
  {
    key: 'logo',
    label: 'Upload your logo',
    helper: 'PNG or JPG, up to 2MB. Skip to add later.',
    required: false,
    validate: () => null,
  },
  {
    key: 'location',
    label: 'Where is your business located?',
    helper: 'Used on the estimate header. All fields are optional.',
    required: false,
    validate: () => null,
  },
  {
    key: 'defaults',
    label: 'Project defaults',
    helper: 'Sensible defaults for new estimates — you can change them anytime.',
    required: false,
    validate: (v) => {
      if (
        typeof v.defaultTaxRate === 'number' &&
        (v.defaultTaxRate < 0 || v.defaultTaxRate > 100)
      ) {
        return 'Tax rate must be between 0 and 100'
      }
      if (typeof v.defaultValidityDays === 'number' && v.defaultValidityDays < 1) {
        return 'Validity must be at least 1 day'
      }
      return null
    },
  },
  {
    key: 'review',
    label: 'Review and finish',
    helper: "Here's everything you've entered. Submit to complete setup.",
    required: false,
    validate: () => null,
  },
] as const

// silence unused-warning suppression
void isValidUrl
