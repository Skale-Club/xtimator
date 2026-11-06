import { z } from 'zod'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

export const draftStepSchema = z.enum(['language', 'companyName', 'industry', 'location', 'brandColor'])
export const draftModeSchema = z.enum(['first', 'add'])
export const draftValuesSchema = z.object({
  language: z.enum(['en', 'pt', 'es']).default('en'),
  companyName: z.string().max(160).default(''),
  industries: z.array(z.string().max(80)).max(30).default([]),
  customIndustries: z.array(z.string().max(80)).max(30).default([]),
  prefillPriceBook: z.boolean().default(false),
  city: z.string().max(120).default(''),
  brandPrimaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  logoUrl: z.string().max(500).default(''),
})
export const saveDraftSchema = z.object({
  id: z.string().uuid(), mode: draftModeSchema, step: draftStepSchema, values: draftValuesSchema,
  clientId: z.string().uuid(), sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict()

export interface OnboardingDraft {
  id: string
  mode: z.infer<typeof draftModeSchema>
  step: z.infer<typeof draftStepSchema>
  values: z.infer<typeof draftValuesSchema>
  last_activity_at: string
  revision: number
}

export function draftValues(values: OnboardingValues): OnboardingDraft['values'] {
  return {
    language: values.language, companyName: values.companyName, industries: values.industries,
    customIndustries: values.customIndustries, prefillPriceBook: values.prefillPriceBook,
    city: values.city, brandPrimaryColor: values.brandPrimaryColor, logoUrl: values.logoUrl ?? '',
  }
}

export function accountDefaults(claims: Record<string, unknown>) {
  const metadata = claims.user_metadata && typeof claims.user_metadata === 'object' ? claims.user_metadata as Record<string, unknown> : {}
  return {
    phone: typeof claims.phone === 'string' ? claims.phone : '',
    email: typeof claims.email === 'string' ? claims.email : '',
    ownerName: typeof metadata.full_name === 'string' ? metadata.full_name : typeof metadata.name === 'string' ? metadata.name : '',
  }
}

export function ownsDraftLogo(url: string, userId: string, draftId: string) {
  if (!url) return true
  const prefix = `/storage/logos/${userId}/onboarding/${draftId}/`
  return url.startsWith(prefix) && /^[0-9a-f-]{36}\.webp$/i.test(url.slice(prefix.length))
}
