import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { OTHER_INDUSTRY_ID } from '@/lib/industries'

export type SurveyStepKey = 'language' | 'companyName' | 'industry' | 'location' | 'brandColor'
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
    helper: 'We’ll guide you through setup in this language.', required: false,
    validate: () => null, isFilled: () => true },
  { key: 'companyName', label: "What's your company name?",
    helper: 'Your verified account contact details are already linked.', required: true,
    validate: values => values.companyName?.trim().length >= 2 ? null : 'Company name must be at least 2 characters',
    isFilled: values => values.companyName?.trim().length >= 2 },
  { key: 'industry', label: 'Which services does your business offer?',
    helper: 'Choose a group, then select the services you offer.', required: false,
    validate: values => values.industries.includes(OTHER_INDUSTRY_ID) && values.customIndustries.length === 0 ? 'Please describe your service' : null,
    isFilled: values => values.industries.length > 0 || values.customIndustries.length > 0 },
  { key: 'location', label: 'Where do you work?',
    helper: 'A city, metro area or state is enough. No street address needed.', required: false,
    validate: () => null, isFilled: values => Boolean(values.city?.trim()) },
  { key: 'brandColor', label: 'Make it yours', helper: 'Choose the color that represents your business. Add a logo if you have one.',
    required: false, validate: () => null, isFilled: () => true },
]
