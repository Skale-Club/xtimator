import 'server-only'
import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from '@/lib/crypto/aes'
import { invalidateBillingConfigCache } from '@/lib/billing/billing-config'

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
  /** Optional 1:1 hero image. Null hides the right-side column. */
  heroImageUrl: string | null
  howItWorksSteps: Array<{
    eyebrow: string
    title: string
    description: string
    imageUrl?: string | null
  }>
  features: Array<{
    icon: string
    title: string
    description: string
    benefit: string
  }>
}

export type IntegrationProvider =
  | 'resend'
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'meta_whatsapp'
  | 'stripe'
  // Stripe Connect Client ID (ca_...) — admin-managed; enables tenant OAuth
  // flow for customer payments on estimates (Phase 70). Not technically a
  // secret per Stripe docs (appears in browser OAuth URLs) but stored via the
  // same encrypted platform_integrations path so admin UX stays uniform.
  | 'stripe_connect_client_id'
  // Twilio — SMS delivery of estimate share links. Key stored as
  // "AccountSid:AuthToken". from_phone stored in metadata.from_phone.
  | 'twilio'
  // Xphere — CRM mirror. API key (xph_… token) stored encrypted via the same
  // platform_integrations path; non-secret base URL stored in metadata.base_url.
  // Disabled-by-default: getXphereConfig() returns null unless both are present.
  | 'xphere'

const TTL_MS = 30_000

let brandingCache: { value: Branding; fetchedAt: number } | null = null
const integrationCache = new Map<string, { value: string; fetchedAt: number }>()

export interface WhatsAppPlatformConfig {
  accessToken: string | null
  phoneNumberId: string | null
  wabaId: string | null
}

let whatsAppConfigCache: { value: WhatsAppPlatformConfig; fetchedAt: number } | null = null

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  heroHeadline: 'Professional estimates in seconds.',
  heroSubheadline:
    'Record a site walkthrough, add photos, pricing, and branded estimate before you leave the driveway.',
  ctaLabel: 'Start',
  heroImageUrl: null,
  howItWorksSteps: [
    {
      eyebrow: 'Option 1',
      title: 'Record audio',
      description:
        'Walk the job site and talk through scope, measurements, and materials while your hands stay free. AI transcribes and builds the estimate.',
    },
    {
      eyebrow: 'Option 2',
      title: 'Describe the job',
      description:
        'Prefer to type? Write out what the job involves and the AI turns your notes into a complete, structured estimate draft.',
    },
    {
      eyebrow: 'Option 3',
      title: 'Upload photos',
      description:
        'Drop in site photos and let AI identify the work, anchor line items to real conditions, and generate an accurate quote.',
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
        ? {
            ...(data.landing_content as LandingContent),
            // Backfill heroImageUrl for rows persisted before the field existed.
            heroImageUrl: (data.landing_content as LandingContent).heroImageUrl ?? null,
          }
        : DEFAULT_LANDING_CONTENT,
  }
  brandingCache = { value: branding, fetchedAt: now }
  return branding
}

/**
 * React cache()-wrapped getBranding.
 * Deduplicates calls within a single render pass (D-06).
 * Use this in layout.tsx files instead of getBranding directly.
 */
export const getCachedBranding = cache(getBranding)

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
    //
    // Per-provider candidate list, tried in order. The default for every provider
    // is the conventional `{PROVIDER}_API_KEY`. Stripe also accepts the documented
    // `STRIPE_SECRET_KEY` name (preferred) with `STRIPE_API_KEY` kept for back-compat,
    // so code and the .env examples agree. Every non-stripe provider keeps the single
    // `{PROVIDER}_API_KEY` candidate — behaviour byte-for-byte unchanged.
    const candidates =
      provider === 'stripe'
        ? ['STRIPE_SECRET_KEY', 'STRIPE_API_KEY']
        : [`${provider.toUpperCase()}_API_KEY`]

    for (const name of candidates) {
      const envKey = process.env[name]
      if (envKey) {
        console.warn(
          `[platform-config] Falling back to env var ${name} for provider ${provider}. Configure via /admin/integrations to remove this warning.`
        )
        integrationCache.set(provider, { value: envKey, fetchedAt: now })
        return envKey
      }
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
  whatsAppConfigCache = null
  // Flush the 30s billing_config TTL so a Plan 02 admin save applies at runtime
  // without a deploy (BILLCFG-02 runtime-apply key link).
  invalidateBillingConfigCache()
}

export type TwilioConfig = {
  accountSid: string
  authToken: string
  fromPhone: string
} | null

export async function getTwilioConfig(): Promise<TwilioConfig> {
  const key = await getIntegrationKey('twilio')
  if (!key) return null

  const [accountSid, authToken] = key.split(':')
  if (!accountSid || !authToken) return null

  const svc = createServiceClient()
  if (!svc) return null
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'twilio')
    .maybeSingle()

  const fromPhone = (data?.metadata as { from_phone?: string } | null)?.from_phone ?? ''
  if (!fromPhone) return null

  return { accountSid, authToken, fromPhone }
}

export type XphereConfig = { apiKey: string; baseUrl: string } | null

/**
 * Read the Xphere CRM credentials: the encrypted API key (via getIntegrationKey,
 * which falls back to the XPHERE_API_KEY env var) plus the non-secret base URL
 * stored in platform_integrations.xphere metadata.base_url (falling back to the
 * XPHERE_BASE_URL env var).
 *
 * Disabled-by-default: returns null unless BOTH the key and a base URL resolve.
 * The trailing slash is stripped from the base URL so callers can append paths.
 */
export async function getXphereConfig(): Promise<XphereConfig> {
  const apiKey = await getIntegrationKey('xphere') // env fallback → XPHERE_API_KEY
  if (!apiKey) return null

  // base URL from platform_integrations.xphere metadata.base_url, else env XPHERE_BASE_URL
  let baseUrl = process.env.XPHERE_BASE_URL ?? ''
  const svc = createServiceClient()
  if (svc) {
    const { data } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'xphere')
      .maybeSingle()
    const fromDb = (data?.metadata as { base_url?: string } | null)?.base_url
    if (fromDb && fromDb.trim()) baseUrl = fromDb.trim()
  }
  if (!baseUrl) return null

  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, '') } // strip trailing slash
}

/**
 * Read the platform-wide default OpenRouter model id stored in
 * `platform_integrations.ai_config.metadata`. OpenRouter is the single AI
 * engine, so this is the default model for any company with no override set.
 */
export async function getOpenRouterDefaultModel(): Promise<string | null> {
  const svc = createServiceClient()
  if (!svc) return null
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'ai_config')
    .maybeSingle()
  const model = (data?.metadata as { openrouter_default_model?: string } | null)
    ?.openrouter_default_model
  return model && model.trim() ? model : null
}

/** OpenAI's classic Whisper model — the default speech-to-text model. */
export const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1'

/** Known OpenAI speech-to-text models selectable from the AI admin screen. */
export const TRANSCRIPTION_MODELS = [
  'whisper-1',
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe',
] as const

export type TranscriptionModel = (typeof TRANSCRIPTION_MODELS)[number]

/**
 * Read the platform-wide speech-to-text model id stored alongside the selected
 * provider in `platform_integrations.ai_config.metadata.transcription_model`.
 * Falls back to whisper-1 when unset. Consumed by the transcription job so the
 * super-admin can switch STT models with no redeploy.
 */
export async function getTranscriptionModel(): Promise<string> {
  const svc = createServiceClient()
  if (!svc) return DEFAULT_TRANSCRIPTION_MODEL
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'ai_config')
    .maybeSingle()
  const model = (data?.metadata as { transcription_model?: string } | null)
    ?.transcription_model
  return model && model.trim() ? model : DEFAULT_TRANSCRIPTION_MODEL
}

/**
 * Load the WhatsApp platform config (access token + phone number ID + WABA ID)
 * from the database with a 30s TTL cache. Falls back to env vars for local dev
 * when the DB row is absent.
 *
 * All three values can be null if neither DB nor env var is configured.
 */
export async function getWhatsAppPlatformConfig(): Promise<WhatsAppPlatformConfig> {
  const now = Date.now()
  if (whatsAppConfigCache && now - whatsAppConfigCache.fetchedAt < TTL_MS) {
    return whatsAppConfigCache.value
  }

  const key = await getIntegrationKey('meta_whatsapp')

  const svc = createServiceClient()
  if (!svc) {
    const fallback: WhatsAppPlatformConfig = {
      accessToken: key ?? process.env.META_WHATSAPP_ACCESS_TOKEN ?? null,
      phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? null,
      wabaId: process.env.META_WHATSAPP_WABA_ID ?? null,
    }
    whatsAppConfigCache = { value: fallback, fetchedAt: now }
    return fallback
  }

  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'meta_whatsapp')
    .maybeSingle()

  const meta = (data?.metadata as { phone_number_id?: string; waba_id?: string } | null)

  const config: WhatsAppPlatformConfig = {
    accessToken: key ?? process.env.META_WHATSAPP_ACCESS_TOKEN ?? null,
    phoneNumberId: meta?.phone_number_id ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? null,
    wabaId: meta?.waba_id ?? process.env.META_WHATSAPP_WABA_ID ?? null,
  }

  whatsAppConfigCache = { value: config, fetchedAt: now }
  return config
}

/**
 * The platform's human-readable WhatsApp display number in E.164 (e.g. "+15551234567").
 * Used to build click-to-chat (wa.me) links — NOT the same as phoneNumberId, which is
 * Meta's internal id. Reads platform_integrations.meta_whatsapp metadata.display_number,
 * falling back to the META_WHATSAPP_DISPLAY_NUMBER env var. Returns null when unset, so
 * callers can gracefully omit the WhatsApp CTA.
 */
export async function getWhatsAppDisplayNumber(): Promise<string | null> {
  const fromEnv = process.env.META_WHATSAPP_DISPLAY_NUMBER ?? null
  const svc = createServiceClient()
  if (!svc) return fromEnv
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'meta_whatsapp')
    .maybeSingle()
  const fromDb = (data?.metadata as { display_number?: string } | null)?.display_number
  const value = (fromDb && fromDb.trim()) || fromEnv
  return value && value.trim() ? value.trim() : null
}

/**
 * Platform-wide, admin-configured system-prompt addendum appended to the base
 * estimate prompt ONLY for WhatsApp-channel estimate generation. Stored in
 * platform_integrations.meta_whatsapp metadata.system_prompt. Read fresh (no
 * separate TTL cache) — freshness is preferred for a low-frequency admin
 * setting. Returns the trimmed value, or null when unset.
 */
export async function getWhatsAppSystemPrompt(): Promise<string | null> {
  const svc = createServiceClient()
  if (!svc) return null
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'meta_whatsapp')
    .maybeSingle()
  const fromDb = (data?.metadata as { system_prompt?: string } | null)?.system_prompt
  return fromDb && fromDb.trim() ? fromDb.trim() : null
}
