import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { OTHER_INDUSTRY_ID } from '@/lib/industries'

export type SurveyStepKey = 'language' | 'companyName' | 'industry' | 'location' | 'brandColor' | 'logo'
export const SURVEY_VERSION = 3
export interface SurveyStepDef {
  key: SurveyStepKey
  label: string
  helper?: string
  required: boolean
  validate: (values: OnboardingValues, logoFile: File | null) => string | null
  isFilled: (values: OnboardingValues, logoFile: File | null) => boolean
}

export const SURVEY_STEPS: readonly SurveyStepDef[] = [
  { key: 'language', label: 'Which language would you like to use Xtimator in?',
    required: false,
    validate: () => null, isFilled: () => true },
  { key: 'companyName', label: "What's your company name?",
    required: true,
    validate: values => values.companyName?.trim().length >= 2 ? null : 'Company name must be at least 2 characters',
    isFilled: values => values.companyName?.trim().length >= 2 },
  { key: 'industry', label: 'Which services does your business offer?',
    helper: 'Select the services you offer.', required: false,
    validate: values => values.industries.includes(OTHER_INDUSTRY_ID) && values.customIndustries.length === 0 ? 'Please describe your service' : null,
    isFilled: values => values.industries.length > 0 || values.customIndustries.length > 0 },
  { key: 'location', label: 'Where do you work?',
    required: false,
    validate: () => null, isFilled: values => Boolean(values.city?.trim()) },
  { key: 'brandColor', label: 'Pick a brand color',
    required: false, validate: () => null, isFilled: () => true },
  { key: 'logo', label: 'Upload your logo', helper: 'PNG or JPG, up to 2MB.',
    required: false, validate: () => null, isFilled: () => true },
]
