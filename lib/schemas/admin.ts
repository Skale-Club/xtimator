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
    'twilio',
    'xphere',
    'telegram',
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
  ogImageFile: z
    .instanceof(File)
    .refine(f => f.size <= 2 * 1024 * 1024, 'OG image must be under 2MB.')
    .refine(
      f => ['image/png', 'image/jpeg', 'image/jpg'].includes(f.type),
      'OG image must be a PNG or JPG.'
    )
    .nullable()
    .optional(),
  ogImageRemoved: z.boolean().optional().default(false),
})

export const landingContentSchema = z.object({
  heroHeadline: z.string().min(1).max(200),
  heroSubheadline: z.string().min(1).max(400),
  ctaLabel: z.string().min(1).max(60),
  /**
   * Optional 1:1 image displayed on the right side of the hero. When null,
   * the hero collapses to a single-column layout (left content centered/full-width).
   * Uploaded via the platform-brand storage bucket under `hero-images/`.
   */
  heroImageUrl: z.string().url().nullable().or(z.literal('')).transform(v => v || null).optional().nullable(),
  /** Toggle for the animated How It Works card backgrounds. Defaults on. */
  howItWorksAnimations: z.boolean().optional().default(true),
  howItWorksSteps: z.array(z.object({
    eyebrow: z.string().max(30),
    title: z.string().max(60),
    description: z.string().max(300),
    imageUrl: z.string().url().nullable().or(z.literal('')).transform(v => v || null).optional().nullable(),
  })).length(3),
  features: z.array(z.object({
    icon: z.string().max(40),
    title: z.string().max(80),
    description: z.string().max(300),
    benefit: z.string().max(60),
    imageUrl: z.string().url().nullable().or(z.literal('')).transform(v => v || null).optional().nullable(),
  })).min(1).max(6),
})

/**
 * Server-side validation for the hero image upload payload. Kept separate
 * from landingContentSchema so the JSON shape stored in `landing_content`
 * stays clean (just a URL) and the file constraints only apply at upload time.
 */
export const heroImageFileSchema = z
  .instanceof(File)
  .refine(f => f.size <= 4 * 1024 * 1024, 'Hero image must be under 4MB.')
  .refine(
    f => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type),
    'Hero image must be a PNG, JPG, or WebP.'
  )

/** Server-side validation for How It Works step image uploads. */
export const stepImageFileSchema = z
  .instanceof(File)
  .refine(f => f.size <= 4 * 1024 * 1024, 'Step image must be under 4MB.')
  .refine(
    f => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type),
    'Step image must be a PNG, JPG, or WebP.'
  )

/** Server-side validation for Features section card image uploads. */
export const featureImageFileSchema = z
  .instanceof(File)
  .refine(f => f.size <= 4 * 1024 * 1024, 'Feature image must be under 4MB.')
  .refine(
    f => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type),
    'Feature image must be a PNG, JPG, or WebP.'
  )

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

/**
 * billing_config (Phase 111 / v4.7 Monetização) — the super-admin-editable
 * billing parameters stored in the metadata-only `platform_integrations`
 * `billing_config` row. Shared source-of-truth shape: the client form, the
 * Plan 02 save action, and the billing-config reader all agree on it.
 *
 * MONEY is INTEGER CENTS; PERCENTAGES are 0..1 decimals (research Pitfall 4).
 */
/**
 * Per-tier entitlement caps + feature flags — mirrors lib/entitlements.ts
 * `Entitlements` (minus monthlyCreditGrant, which lives on tierBillingSchema).
 * null = unlimited on the count caps (never Infinity — JSON serialization).
 */
const tierEntitlementsSchema = z.object({
  maxEstimatesPerMonth: z.number().int().min(0).nullable(),
  maxEstimatesPerDay: z.number().int().min(0).nullable(),
  maxPriceResearchPerMonth: z.number().int().min(0).nullable(),
  maxPhotosPerEstimate: z.number().int().min(0),
  maxAudioMinutesPerEstimate: z.number().int().min(0),
  whatsappEnabled: z.boolean(),
  pdfEnabled: z.boolean(),
  priceBookEnabled: z.boolean(),
  customDomainEnabled: z.boolean(),
  chatEnabled: z.boolean(),
})

const tierBillingSchema = z.object({
  monthlyCreditGrant: z.number().int().min(0),
  subscriptionPriceCents: z.number().int().min(0),
  // per-tier ANNUAL subscription price in integer cents (no upper bound that would reject a sane annual price).
  subscriptionPriceAnnualCents: z.number().int().min(0),
  // seats bundled in the tier before per-seat billing (non-negative int count).
  includedSeats: z.number().int().min(0),
  // Stripe Price IDs auto-created/refreshed by the save action (null until provisioned).
  stripePriceIdMonth: z.string().nullable(),
  stripePriceIdYear: z.string().nullable(),
  // Runtime-editable per-tier entitlement caps + feature flags.
  entitlements: tierEntitlementsSchema,
  // Marketing feature bullets rendered on the tier card.
  featureBullets: z.array(z.string().max(120)).max(8),
})

export const billingConfigSchema = z.object({
  markup: z.number().positive().max(100),
  creditUnitUsd: z.number().positive().max(1),
  whisperUsdPerMinute: z.number().min(0).max(10),
  estimateFeePct: z.number().min(0).max(1),
  estimateFeeMinCents: z.number().int().min(0),
  // monthly price of one billable seat in integer cents (no upper bound that would reject a sane price).
  seatPriceCents: z.number().int().min(0),
  // global ANNUAL per-seat price in integer cents (no upper bound that would reject a sane annual price).
  seatPriceAnnualCents: z.number().int().min(0),
  tiers: z.object({
    free: tierBillingSchema,
    pro: tierBillingSchema,
    business: tierBillingSchema,
  }),
  topUpPacks: z
    .array(z.object({ credits: z.number().int().positive(), priceCents: z.number().int().positive() }))
    .max(10),
  lowBalanceThresholds: z.array(z.number().int().min(0)).max(5),
  meteredOperations: z.record(z.string(), z.boolean()),
  absorbedChatRateLimitPerMin: z.number().int().min(0).max(1000),
  // Billing v2: one-time signup credit grant — the free tier's entire allowance.
  signupCreditGrant: z.number().int().min(0),
  /**
   * Master charging switch (CREDIT-05). Billing v2 runs with this ON — the
   * free-tier wall depends on it; false reverts to record-only.
   */
  enforcementEnabled: z.boolean(),
  /**
   * Platform-wide auto-top-up kill switch (CREDITUI-07). Mirrors
   * enforcementEnabled's exact pattern: default FALSE.
   */
  autoTopupEnabled: z.boolean(),
})
export type BillingConfigInput = z.infer<typeof billingConfigSchema>

export const legalPageSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
  effectiveDate: z.string().nullable(),
})

export type SeoInput = z.infer<typeof seoSchema>
export type LandingContentInput = z.infer<typeof landingContentSchema>
export type BlogPostInput = z.infer<typeof blogPostSchema>
export type LegalPageInput = z.infer<typeof legalPageSchema>
