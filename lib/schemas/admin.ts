import { z } from 'zod'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { assetUrlString } from './asset-url'

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
  ogImageUrl: assetUrlString('Must be a valid URL').nullable().or(z.literal('')).transform(v => v || null),
  // STAYS STRICT: a canonical base URL is by definition absolute — it is the
  // origin other URLs are resolved against, never a same-origin path.
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

/** Zoom/drag display position stored alongside any admin-uploaded image. */
export const imagePositionSchema = z.object({
  scale: z.number().min(1).max(3),
  x: z.number().min(-50).max(50),
  y: z.number().min(-50).max(50),
}).nullable().optional()
export type ImagePosition = z.infer<typeof imagePositionSchema>

export const landingContentSchema = z.object({
  heroHeadline: z.string().min(1).max(200),
  heroSubheadline: z.string().min(1).max(400),
  ctaLabel: z.string().min(1).max(60),
  /**
   * Optional 1:1 image displayed on the right side of the hero. When null,
   * the hero collapses to a single-column layout (left content centered/full-width).
   * Uploaded via the platform-brand storage bucket under `hero-images/`.
   */
  heroImageUrl: assetUrlString().nullable().or(z.literal('')).transform(v => v || null).optional().nullable(),
  heroImagePosition: imagePositionSchema,
  /**
   * Full-bleed backdrop behind the whole hero section — 'none' shows the
   * existing decorative gradient/dot mesh instead. Image and video URLs are
   * both kept in storage even when the other type is active (switching back
   * and forth in the admin UI doesn't lose an uploaded asset) — only the
   * URL matching heroBackgroundType actually renders.
   */
  heroBackgroundType: z.enum(['none', 'image', 'video']).optional().default('none'),
  heroBackgroundImageUrl: assetUrlString().nullable().or(z.literal('')).transform(v => v || null).optional().nullable(),
  heroBackgroundPosition: imagePositionSchema,
  /**
   * Relaxed like the other asset fields (accepting a same-origin path is a
   * harmless superset), but its WRITER is deliberately NOT repointed: the
   * Phase 187 proxy is whole-object pass-through with no Range/206, and Safari
   * refuses to play a <video> from an origin that does not honour byte-range
   * requests. This field keeps its absolute Supabase URL until the proxy gains
   * Range support. A relaxed validator is not permission to repoint the writer.
   */
  heroBackgroundVideoUrl: assetUrlString().nullable().or(z.literal('')).transform(v => v || null).optional().nullable(),
  /** Toggle for the animated How It Works card backgrounds. Defaults on. */
  howItWorksAnimations: z.boolean().optional().default(true),
  /**
   * 3-6 steps. The first 3 always get their matching animation (waveform /
   * typing dots / camera — indices 0/1/2, see HowItWorksSection); any step
   * beyond index 2 renders halo-only (no animation exists for it yet).
   */
  howItWorksSteps: z.array(z.object({
    eyebrow: z.string().max(30),
    title: z.string().max(60),
    description: z.string().max(300),
    imageUrl: assetUrlString().nullable().or(z.literal('')).transform(v => v || null).optional().nullable(),
    imagePosition: imagePositionSchema,
  })).min(3).max(6),
  features: z.array(z.object({
    icon: z.string().max(40),
    title: z.string().max(80),
    description: z.string().max(300),
    benefit: z.string().max(60),
    imageUrl: assetUrlString().nullable().or(z.literal('')).transform(v => v || null).optional().nullable(),
    imagePosition: imagePositionSchema,
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

/**
 * Server-side validation for the hero BACKGROUND image upload — a separate
 * full-bleed layer behind the whole hero section, distinct from heroImageFile
 * (the foreground subject photo). Bigger cap than the other hero images since
 * it needs to look good stretched across the full section width.
 */
export const heroBackgroundImageFileSchema = z
  .instanceof(File)
  .refine(f => f.size <= 8 * 1024 * 1024, 'Background image must be under 8MB.')
  .refine(
    f => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type),
    'Background image must be a PNG, JPG, or WebP.'
  )

/**
 * Server-side validation for the hero background VIDEO upload. NOT converted
 * to WebP/re-encoded — there's no video transcoding step in this stack
 * (would need ffmpeg), so the uploaded file is stored as-is.
 */
export const heroBackgroundVideoFileSchema = z
  .instanceof(File)
  .refine(f => f.size <= 20 * 1024 * 1024, 'Background video must be under 20MB.')
  .refine(
    f => ['video/mp4', 'video/webm'].includes(f.type),
    'Background video must be MP4 or WebM.'
  )

export const blogPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  content: z.string().min(1),
  excerpt: z.string().max(500).nullable(),
  // STAYS STRICT: blog covers are pasted external URLs — there is no
  // getPublicUrl writer for this field, so Phase 190 never makes it relative.
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
