import { z } from 'zod'
import { SYSTEM_COLORS } from '@/lib/system-colors'

/**
 * Shared zod schemas for the Platform Admin Panel (/admin/*).
 *
 * Exported here so Plans 04 (integrations), 05 (branding), and 06 (admins)
 * import the same source-of-truth shape — no schema drift between client
 * forms and server actions.
 */

export const integrationKeySchema = z.object({
  provider: z.enum([
    'resend',
    'anthropic',
    'openai',
    'gemini',
    'openrouter',
    'meta_whatsapp',
    'stripe',
    'stripe_connect_client_id',
  ]),
  apiKey: z.string().min(1, 'API key is required'),
})

export const brandingSchema = z.object({
  appName: z.string().min(1).max(64),
  primaryColor: z
    .string()
    .regex(
      /^#[0-9a-fA-F]{6}$/,
      `Invalid color code. Please enter a 6-digit hex value like ${SYSTEM_COLORS.primary}`
    )
    .nullable(),
  emailFromName: z.string().max(128).nullable(),
  logoFile: z.instanceof(File).nullable().optional(),
})

export const addAdminSchema = z.object({
  email: z.string().email(),
})

export type IntegrationKeyInput = z.infer<typeof integrationKeySchema>
export type BrandingInput = z.infer<typeof brandingSchema>
export type AddAdminInput = z.infer<typeof addAdminSchema>

export const seoSchema = z.object({
  siteTitle: z.string().max(120).nullable(),
  metaDescription: z.string().max(300).nullable(),
  ogImageUrl: z.string().url('Must be a valid URL').nullable().or(z.literal('')).transform(v => v || null),
  canonicalBaseUrl: z.string().url('Must be a valid URL').nullable().or(z.literal('')).transform(v => v || null),
})

export const landingContentSchema = z.object({
  heroHeadline: z.string().min(1).max(200),
  heroSubheadline: z.string().min(1).max(400),
  ctaLabel: z.string().min(1).max(60),
  howItWorksSteps: z.array(z.object({
    eyebrow: z.string().max(30),
    title: z.string().max(60),
    description: z.string().max(300),
  })).length(3),
  features: z.array(z.object({
    icon: z.string().max(40),
    title: z.string().max(80),
    description: z.string().max(300),
    benefit: z.string().max(60),
  })).min(1).max(6),
})

export const blogPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  content: z.string().min(1),
  excerpt: z.string().max(500).nullable(),
  coverImageUrl: z.string().url().nullable().or(z.literal('')).transform(v => v || null),
  status: z.enum(['draft', 'published']),
  metaTitle: z.string().max(120).nullable(),
  metaDescription: z.string().max(300).nullable(),
})

export type SeoInput = z.infer<typeof seoSchema>
export type LandingContentInput = z.infer<typeof landingContentSchema>
export type BlogPostInput = z.infer<typeof blogPostSchema>
