import type { OnboardingValues } from '@/lib/schemas/onboarding'

export type SurveyStepKey =
  | 'companyName'
  | 'ownerName'
  | 'phone'
  | 'email'
  | 'industry'
  | 'language'
  | 'brandColor'
  | 'logo'
  | 'location'
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
  /**
   * Returns true when the step's primary field(s) carry a user-provided value.
   * Used to decide which action to show: filled → "Next", empty → "Skip".
   * Required steps always advance with Next, so this is only consulted for optional steps.
   */
  isFilled: (values: OnboardingValues, logoFile: File | null) => boolean
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
    isFilled: (v) => !!v.companyName && v.companyName.trim().length >= 2,
  },
  {
    key: 'ownerName',
    label: "What's your name?",
    helper: 'Owner or primary contact for this business.',
    required: false,
    validate: () => null,
    isFilled: (v) => !!v.ownerName?.trim(),
  },
  {
    key: 'phone',
    label: "What's the best phone number to reach you?",
    helper: 'Customers may use this on estimates and invoices.',
    required: false,
    validate: () => null,
    isFilled: (v) => !!v.phone?.trim(),
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
    isFilled: (v) => !!v.email?.trim(),
  },
  {
    key: 'industry',
    label: 'Which services does your business offer?',
    helper: 'Select all that apply — we use these to tailor estimates and price-book starters.',
    required: false,
    validate: (v) => {
      if (v.industries.includes('other') && (!v.customIndustry || v.customIndustry.trim() === '')) {
        return 'Please describe your service'
      }
      return null
    },
    isFilled: (v) => v.industries.length > 0,
  },
  {
    key: 'language',
    label: 'In what language do you work day-to-day?',
    helper: 'Your estimates will default to this language. You can change it per estimate when needed.',
    required: false,
    validate: () => null,
    // Always has a selection (defaults to 'en') — treat as always filled so Next shows instead of Skip.
    isFilled: () => true,
  },
  {
    key: 'brandColor',
    label: 'Pick a brand color',
    helper: 'Used for accents on PDFs and shareable estimates.',
    required: false,
    validate: () => null,
    // Always has a color selected (defaults to the platform primary) — treat as always filled.
    isFilled: () => true,
  },
  {
    key: 'logo',
    label: 'Upload your logo',
    helper: 'PNG or JPG, up to 2MB. Skip to add later.',
    required: false,
    validate: () => null,
    isFilled: (_v, logoFile) => logoFile !== null,
  },
  {
    key: 'location',
    label: 'Where is your business located?',
    helper: 'Used on the estimate header. All fields are optional.',
    required: false,
    validate: () => null,
    isFilled: (v) =>
      !!(v.address?.trim() || v.city?.trim() || v.state?.trim() || v.zip?.trim()),
  },
  {
    key: 'review',
    label: 'Review and finish',
    helper: "Here's everything you've entered. Submit to complete setup.",
    required: false,
    validate: () => null,
    isFilled: () => true,
  },
] as const

// silence unused-warning suppression
void isValidUrl
