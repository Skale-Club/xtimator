import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from '@/lib/crypto/aes'

export type Branding = {
  appName: string
  logoUrl: string | null
  primaryColor: string | null
  emailFromName: string | null
}

export type IntegrationProvider = 'resend' | 'anthropic' | 'openai'

const TTL_MS = 60_000

let brandingCache: { value: Branding; fetchedAt: number } | null = null
const integrationCache = new Map<string, { value: string; fetchedAt: number }>()

const FALLBACK_BRANDING: Branding = {
  appName: 'Xtimator',
  logoUrl: null,
  primaryColor: null,
  emailFromName: null,
}

export async function getBranding(): Promise<Branding> {
  const now = Date.now()
  if (brandingCache && now - brandingCache.fetchedAt < TTL_MS) {
    return brandingCache.value
  }
  const svc = createServiceClient()
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
  }
  brandingCache = { value: branding, fetchedAt: now }
  return branding
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
