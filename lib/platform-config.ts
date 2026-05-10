import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from '@/lib/crypto/aes'

export type Branding = {
  appName: string
  logoUrl: string | null
  primaryColor: string | null
  emailFromName: string | null
  siteTitle: string | null
  metaDescription: string | null
  ogImageUrl: string | null
  canonicalBaseUrl: string | null
  faviconUrl: string | null
  landingContent: LandingContent
}

export type LandingContent = {
  heroHeadline: string
  heroSubheadline: string
  ctaLabel: string
  howItWorksSteps: Array<{
    eyebrow: string
    title: string
    description: string
  }>
  features: Array<{
    icon: string
    title: string
    description: string
    benefit: string
  }>
}

export type IntegrationProvider = 'resend' | 'anthropic' | 'openai' | 'gemini' | 'meta_whatsapp'

const TTL_MS = 30_000

let brandingCache: { value: Branding; fetchedAt: number } | null = null
const integrationCache = new Map<string, { value: string; fetchedAt: number }>()

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  heroHeadline: 'Professional estimates in 5 minutes.',
  heroSubheadline:
    'Record a site walkthrough, add photos, and let AI draft the scope, pricing, and branded PDF before you leave the driveway.',
  ctaLabel: 'Start free',
  howItWorksSteps: [
    {
      eyebrow: 'Step 1',
      title: 'Record audio',
      description:
        'Walk the property and talk through measurements, materials, and special requests while your hands stay free.',
    },
    {
      eyebrow: 'Step 2',
      title: 'Add photos',
      description:
        'Drop in site photos so the AI can anchor line items to the real condition of the work.',
    },
    {
      eyebrow: 'Step 3',
      title: 'Get estimate',
      description:
        'Review the draft estimate, then send a branded PDF or live link without rebuilding the job from scratch.',
    },
  ],
  features: [
    {
      icon: 'BrainCircuit',
      title: 'AI-generated estimate draft',
      description:
        'Turns field notes and site photos into a structured scope you can review instead of writing from a blank page.',
      benefit: 'Skip the blank-page struggle',
    },
    {
      icon: 'FileBadge2',
      title: 'Branded PDF output',
      description:
        'Send estimates that look polished, consistent, and ready for the customer without extra formatting work.',
      benefit: 'Look professional',
    },
    {
      icon: 'Link2',
      title: 'Share link for fast approvals',
      description:
        'Deliver a live estimate link when the customer wants the quote now, not after you get back to the office.',
      benefit: 'Faster response',
    },
    {
      icon: 'Smartphone',
      title: 'Mobile-first from the driveway',
      description:
        'Designed for iPhone and Android job-site use, where typing is slow and conditions are rarely perfect.',
      benefit: 'Works where you work',
    },
  ],
}

const FALLBACK_BRANDING: Branding = {
  appName: 'Xtimator',
  logoUrl: null,
  primaryColor: null,
  emailFromName: null,
  siteTitle: null,
  metaDescription: null,
  ogImageUrl: null,
  canonicalBaseUrl: null,
  faviconUrl: null,
  landingContent: DEFAULT_LANDING_CONTENT,
}

export async function getBranding(): Promise<Branding> {
  const now = Date.now()
  if (brandingCache && now - brandingCache.fetchedAt < TTL_MS) {
    return brandingCache.value
  }
  const svc = createServiceClient()
  // svc is null when env vars are absent (e.g. Vercel static build time).
  if (!svc) {
    brandingCache = { value: FALLBACK_BRANDING, fetchedAt: now }
    return FALLBACK_BRANDING
  }
  const { data, error } = await svc
    .from('platform_branding')
    .select('*')
    .eq('id', 1)
    .single()
  if (error || !data) {
    // Null-safe fallback so pages never crash before the admin seeds the row (R-04).
    brandingCache = { value: FALLBACK_BRANDING, fetchedAt: now }
    return FALLBACK_BRANDING
  }
  const branding: Branding = {
    appName: data.app_name,
    logoUrl: data.logo_url,
    primaryColor: data.primary_color,
    emailFromName: data.email_from_name,
    siteTitle: data.site_title ?? null,
    metaDescription: data.meta_description ?? null,
    ogImageUrl: data.og_image_url ?? null,
    canonicalBaseUrl: data.canonical_base_url ?? null,
    faviconUrl: data.favicon_url ?? null,
    landingContent:
      data.landing_content && Object.keys(data.landing_content).length > 0
        ? (data.landing_content as LandingContent)
        : DEFAULT_LANDING_CONTENT,
  }
  brandingCache = { value: branding, fetchedAt: now }
  return branding
}

export async function getLandingContent(): Promise<LandingContent> {
  const branding = await getBranding()
  return branding.landingContent
}

export async function getIntegrationKey(
  provider: IntegrationProvider
): Promise<string | null> {
  const now = Date.now()
  const cached = integrationCache.get(provider)
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.value
  }

  const svc = createServiceClient()
  // svc is null when env vars are absent (e.g. Vercel static build time).
  if (!svc) return null
  const { data } = await svc
    .from('platform_integrations')
    .select('ciphertext, iv, auth_tag')
    .eq('provider', provider)
    .maybeSingle()

  if (!data) {
    // Fallback to env var for local dev (D-16). Warn so the fallback path is visible.
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`]
    if (envKey) {
      console.warn(
        `[platform-config] Falling back to env var ${provider.toUpperCase()}_API_KEY for provider ${provider}. Configure via /admin/integrations to remove this warning.`
      )
      integrationCache.set(provider, { value: envKey, fetchedAt: now })
      return envKey
    }
    return null
  }

  try {
    const plaintext = decrypt({
      ciphertext: toBuffer(data.ciphertext),
      iv: toBuffer(data.iv),
      authTag: toBuffer(data.auth_tag),
    })
    integrationCache.set(provider, { value: plaintext, fetchedAt: now })
    return plaintext
  } catch (e) {
    console.error(
      `[platform-config] Failed to decrypt ${provider} key; check APP_ENCRYPTION_KEY`,
      e
    )
    return null
  }
}

/**
 * Normalise BYTEA values returned by Supabase PostgREST into a Buffer.
 *
 * PostgREST serialises bytea as `\x` + lowercase hex (the Postgres `bytea_output=hex`
 * default). When Supabase JS deserialises it, the value reaches userland as a string.
 * Newer Supabase versions may return Uint8Array directly; both are handled here.
 *
 * Without this normalisation, `Buffer.from('\\xabcd...')` interprets the value as
 * UTF-8 text and produces the wrong byte length, causing GCM decryption to throw
 * "invalid iv length" and silently dropping the integration to null.
 */
function toBuffer(value: unknown): Buffer {
  if (value instanceof Buffer) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex')
    // Fallback: try base64 then hex
    return Buffer.from(value, 'base64')
  }
  return Buffer.from(value as ArrayBuffer)
}

export function invalidatePlatformConfig(): void {
  brandingCache = null
  integrationCache.clear()
}

export type SelectedAIProvider = 'anthropic' | 'gemini'

export async function getSelectedAIProvider(): Promise<SelectedAIProvider> {
  const svc = createServiceClient()
  if (!svc) return 'anthropic'
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'ai_config')
    .maybeSingle()
  const selected = (data?.metadata as { selected_ai_provider?: string } | null)?.selected_ai_provider
  return selected === 'gemini' ? 'gemini' : 'anthropic'
}
