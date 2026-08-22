'use server'

import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { encrypt } from '@/lib/crypto/aes'
import {
  getIntegrationKey,
  getXphereConfig,
  invalidatePlatformConfig,
  TRANSCRIPTION_MODELS,
  type IntegrationProvider,
} from '@/lib/platform-config'
import { integrationKeySchema, billingConfigSchema } from '@/lib/schemas/admin'
import { validateMarginInvariant, type TierMarginResult } from '@/lib/billing/calibration'
import { syncAllTierPrices, archivePrices } from '@/lib/billing/stripe-subscription-prices'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { invalidateStripeDisplayPricesCache } from '@/lib/billing/stripe-display-prices'
import { EMAIL_FROM_ADDRESS } from '@/lib/email/sender'
import { sendTelegramMessage } from '@/lib/telegram/client'

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string }

/**
 * Save (upsert) an encrypted API key for one of the platform-wide providers.
 *
 * Flow: requireAdmin → validate → encrypt → upsert → invalidate cache → revalidate path.
 * The plaintext apiKey never leaves this function — only ciphertext + iv + auth_tag
 * are persisted (R-02 mitigation).
 */
export async function saveIntegrationKey(input: {
  provider: IntegrationProvider
  apiKey: string
}): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const parsed = integrationKeySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const blob = encrypt(parsed.data.apiKey)
  const svc = requireServiceClient()
  // Supabase JS serialises Buffer values via JSON.stringify(), which corrupts
  // BYTEA round-trips. Send `\xHEX` strings — PostgREST stores those as raw
  // bytes and round-trips back through `toBuffer()` in lib/platform-config.ts.
  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: parsed.data.provider,
      ciphertext: '\\x' + blob.ciphertext.toString('hex'),
      iv: '\\x' + blob.iv.toString('hex'),
      auth_tag: '\\x' + blob.authTag.toString('hex'),
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )

  if (error) {
    return { ok: false, message: error.message }
  }

  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  const last4 = parsed.data.apiKey.slice(-4)
  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.save',
    targetType: 'integration',
    targetId: parsed.data.provider,
    metadata: { last4 },
  })

  return { ok: true }
}

/**
 * Delete a platform integration row entirely. Features that depend on the
 * provider will fall back to the env var (if set) or 503 (D-15).
 */
export async function deleteIntegrationKey(input: {
  provider: IntegrationProvider
}): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()
  const { error } = await svc
    .from('platform_integrations')
    .delete()
    .eq('provider', input.provider)
  if (error) {
    return { ok: false, message: error.message }
  }
  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.delete',
    targetType: 'integration',
    targetId: input.provider,
  })

  return { ok: true }
}

/**
 * Run a real verification call against the configured key for the provider.
 *
 * - resend: send a minimal email to the calling admin's address
 * - anthropic: 1-token completion against claude-sonnet-4-20250514
 * - openai: GET /v1/models, count results
 *
 * Returns { ok: false, message } on any thrown error so the UI can surface
 * provider error text directly without a generic catch-all.
 */
export async function testIntegrationKey(input: {
  provider: IntegrationProvider
  /** Optional — test this unsaved key directly (skips DB read) so admins can validate before saving */
  key?: string
}): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const result = await runTestIntegrationKey(ctx, input)
  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.test',
    targetType: 'integration',
    targetId: input.provider,
    metadata: { ok: result.ok },
  })
  return result
}

async function runTestIntegrationKey(
  ctx: { userId: string; email: string },
  input: { provider: IntegrationProvider; key?: string }
): Promise<ActionResult> {
  const key = input.key?.trim() || (await getIntegrationKey(input.provider))
  if (!key) {
    return { ok: false, message: 'No key configured' }
  }

  try {
    if (input.provider === 'resend') {
      const resend = new Resend(key)
      const { error } = await resend.emails.send({
        from: EMAIL_FROM_ADDRESS,
        to: ctx.email,
        subject: 'Xtimator admin key test',
        text: 'Key verified',
      })
      if (error) {
        return { ok: false, message: error.message }
      }
      return {
        ok: true,
        message: `Verified. Sent a test email to ${ctx.email} \u2014 check your inbox.`,
      }
    }

    if (input.provider === 'anthropic') {
      const anthropic = new Anthropic({ apiKey: key })
      const start = Date.now()
      await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
      const ms = Date.now() - start
      return { ok: true, message: `Verified. Claude responded in ${ms}ms.` }
    }

    if (input.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return {
          ok: false,
          message: `OpenAI rejected the key (${res.status}). ${body.slice(0, 200)}`.trim(),
        }
      }
      const json = (await res.json()) as { data?: unknown[] }
      const n = Array.isArray(json.data) ? json.data.length : 0
      return { ok: true, message: `Verified. Found ${n} models available.` }
    }

    if (input.provider === 'gemini') {
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey: key })
      const start = Date.now()
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'hi',
        config: { maxOutputTokens: 1 },
      })
      const ms = Date.now() - start
      return { ok: true, message: `Verified. Gemini responded in ${ms}ms.` }
    }

    if (input.provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return {
          ok: false,
          message: `OpenRouter rejected the key (${res.status}). ${body.slice(0, 200)}`.trim(),
        }
      }
      const json = (await res.json()) as { data?: unknown[] }
      const n = Array.isArray(json.data) ? json.data.length : 0
      return { ok: true, message: `Verified. ${n} models available via OpenRouter.` }
    }

    if (input.provider === 'meta_whatsapp') {
      const res = await fetch('https://graph.facebook.com/v21.0/me', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return {
          ok: false,
          message: `Meta rejected the token (${res.status}). ${body.slice(0, 200)}`.trim(),
        }
      }
      const json = (await res.json()) as { name?: string; id?: string }
      return {
        ok: true,
        message: `Verified. Token belongs to "${json.name ?? json.id ?? 'unknown'}".`,
      }
    }

    if (input.provider === 'twilio') {
      // key format: "AccountSid:AuthToken"
      const [accountSid, authToken] = key.split(':')
      if (!accountSid || !authToken) {
        return { ok: false, message: 'Key must be in "AccountSid:AuthToken" format.' }
      }
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
        { headers: { Authorization: `Basic ${credentials}` } }
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return {
          ok: false,
          message: `Twilio rejected the credentials (${res.status}). ${body.slice(0, 200)}`.trim(),
        }
      }
      const json = (await res.json()) as { friendly_name?: string; status?: string }
      return {
        ok: true,
        message: `Verified. Account "${json.friendly_name ?? accountSid}" is ${json.status ?? 'active'}.`,
      }
    }

    if (input.provider === 'stripe_connect_client_id') {
      // No test endpoint — the Client ID is a public identifier, not a
      // credential. Verification happens implicitly via the OAuth flow
      // (Settings → Payments → Connect).
      return {
        ok: true,
        message: 'Client ID stored. No test endpoint — verify via Settings → Payments OAuth flow.',
      }
    }

    if (input.provider === 'xphere') {
      // The Xphere receiver (POST {baseUrl}/api/xtimator/webhook) mutates CRM
      // state, so we must NOT call it as a reachability probe. Instead confirm
      // both the API key and base URL resolve via getXphereConfig().
      const config = await getXphereConfig()
      if (!config) {
        return { ok: false, message: 'Set both the API key and base URL.' }
      }
      return {
        ok: true,
        message: `Configured. Base URL ${config.baseUrl} set; key ends …${config.apiKey.slice(-4)}.`,
      }
    }

    if (input.provider === 'stripe') {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
      const balance = await stripe.balance.retrieve()
      const available = balance.available[0]
      return {
        ok: true,
        message: `Verified. Available balance: ${available?.currency?.toUpperCase() ?? 'USD'}.`,
      }
    }

    // Exhaustiveness fallback (TS narrows above; defensive)
    return { ok: false, message: `Unknown provider: ${String(input.provider)}` }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return { ok: false, message }
  }
}

/**
 * Save the Twilio outbound phone number into the platform_integrations metadata.
 * Stored as { from_phone: "+1..." } alongside the existing encrypted key.
 */
export async function saveTwilioFromPhone(
  fromPhone: string
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const trimmed = fromPhone.trim()
  if (trimmed && !/^\+[1-9]\d{7,14}$/.test(trimmed)) {
    return { ok: false, message: 'Phone must be in E.164 format (e.g. +15551234567)' }
  }

  const svc = requireServiceClient()
  const { data: existing } = await svc
    .from('platform_integrations')
    .select('ciphertext, iv, auth_tag, metadata')
    .eq('provider', 'twilio')
    .maybeSingle()

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'twilio',
      ciphertext: existing?.ciphertext ?? null,
      iv: existing?.iv ?? null,
      auth_tag: existing?.auth_tag ?? null,
      metadata: { ...((existing?.metadata as object) ?? {}), from_phone: trimmed },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )

  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.save',
    targetType: 'integration',
    targetId: 'twilio_from_phone',
    metadata: { from_phone: trimmed },
  })

  return { ok: true }
}

/**
 * Save the dedicated Twilio Messaging Service SID used ONLY for end-customer
 * SMS (CUST-02), into the SAME 'twilio' platform_integrations row's metadata
 * — a DIFFERENT field from from_phone (metadata.customer_messaging_service_sid).
 * Mirrors saveTwilioFromPhone exactly: preserves the existing encrypted
 * ciphertext/iv/auth_tag, merges into existing metadata. Empty string is
 * allowed to clear the field (mirrors saveTelegramChatId's empty-allowed
 * pattern) — clearing it makes getTwilioCustomerMessagingConfig() return null,
 * which makes sendCustomerSms() refuse to send (never falls back to
 * from_phone / the shared owner number).
 */
export async function saveTwilioCustomerMessagingServiceSid(
  sid: string
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const trimmed = sid.trim()
  if (trimmed && !/^MG[0-9a-fA-F]{32}$/.test(trimmed)) {
    return {
      ok: false,
      message: 'Must be a Twilio Messaging Service SID (starts with MG, 34 characters).',
    }
  }

  const svc = requireServiceClient()
  const { data: existing } = await svc
    .from('platform_integrations')
    .select('ciphertext, iv, auth_tag, metadata')
    .eq('provider', 'twilio')
    .maybeSingle()

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'twilio',
      ciphertext: existing?.ciphertext ?? null,
      iv: existing?.iv ?? null,
      auth_tag: existing?.auth_tag ?? null,
      metadata: {
        ...((existing?.metadata as object) ?? {}),
        customer_messaging_service_sid: trimmed,
      },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )

  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.save',
    targetType: 'integration',
    targetId: 'twilio_customer_messaging_service_sid',
    metadata: { customer_messaging_service_sid: trimmed },
  })

  return { ok: true }
}

/**
 * Save the Xphere CRM base URL into platform_integrations.xphere metadata.
 * Stored as { base_url: "https://..." } alongside the existing encrypted key.
 * Validates that the value is a well-formed http(s) origin so getXphereConfig()
 * (and the Plan 03 client) can safely append paths to it.
 */
export async function saveXphereBaseUrl(
  baseUrl: string
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const trimmed = baseUrl.trim()

  if (trimmed) {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(trimmed)
    } catch {
      return { ok: false, message: 'Base URL must be a valid http(s) URL' }
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { ok: false, message: 'Base URL must be a valid http(s) URL' }
    }
  }

  const svc = requireServiceClient()
  const { data: existing } = await svc
    .from('platform_integrations')
    .select('ciphertext, iv, auth_tag, metadata')
    .eq('provider', 'xphere')
    .maybeSingle()

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'xphere',
      ciphertext: existing?.ciphertext ?? null,
      iv: existing?.iv ?? null,
      auth_tag: existing?.auth_tag ?? null,
      metadata: { ...((existing?.metadata as object) ?? {}), base_url: trimmed },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )

  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.save',
    targetType: 'integration',
    targetId: 'xphere_base_url',
    metadata: { base_url: trimmed },
  })

  return { ok: true }
}

/**
 * Save the Telegram ops-alert destination chat_id into
 * platform_integrations.telegram metadata. Stored as { chat_id: "..." }
 * alongside the existing encrypted bot token (preserved), mirroring
 * saveTwilioFromPhone.
 *
 * Telegram chat_ids are numeric and may be negative (groups/channels use a
 * negative id). Empty is allowed so the operator can clear the destination
 * (the system then goes dormant via getTelegramConfig()).
 */
export async function saveTelegramChatId(chatId: string): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const trimmed = chatId.trim()
  if (trimmed && !/^-?\d+$/.test(trimmed)) {
    return {
      ok: false,
      message:
        'Chat ID must be a numeric Telegram chat id (e.g. 123456789 or -1001234567890).',
    }
  }

  const svc = requireServiceClient()
  const { data: existing } = await svc
    .from('platform_integrations')
    .select('ciphertext, iv, auth_tag, metadata')
    .eq('provider', 'telegram')
    .maybeSingle()

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'telegram',
      ciphertext: existing?.ciphertext ?? null,
      iv: existing?.iv ?? null,
      auth_tag: existing?.auth_tag ?? null,
      metadata: { ...((existing?.metadata as object) ?? {}), chat_id: trimmed },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )

  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.save',
    targetType: 'integration',
    targetId: 'telegram_chat_id',
    metadata: { chat_id: trimmed },
  })

  return { ok: true }
}

/**
 * Send a real test alert to the configured Telegram chat so the operator can
 * verify their bot token + chat_id end to end from the admin panel.
 *
 * This is the ONE place a Telegram transport error is surfaced to the user —
 * every event-driven alert path (later plans) swallows/logs failures instead.
 * A missing/invalid credential surfaces here as { ok:false, message }.
 */
export async function sendTelegramTestAlert(): Promise<ActionResult> {
  const ctx = await requireAdmin()
  try {
    await sendTelegramMessage(
      "✅ Xtimator ops alerts connected — you'll receive system-health alerts here."
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    void logAdminAction({
      actorId: ctx.userId,
      actorEmail: ctx.email,
      action: 'integration.test',
      targetType: 'integration',
      targetId: 'telegram',
      metadata: { ok: false },
    })
    return { ok: false, message }
  }

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.test',
    targetType: 'integration',
    targetId: 'telegram',
    metadata: { ok: true },
  })
  return { ok: true, message: 'Test alert sent — check your Telegram.' }
}

/**
 * Save Phone Number ID and WABA ID for the Meta WhatsApp integration into
 * platform_integrations.metadata. Preserves existing encrypted token fields.
 * These are non-secret platform identifiers that enable DB-configurable routing
 * without a redeploy.
 */
export async function saveWhatsAppConfig(input: {
  phoneNumberId: string
  wabaId: string
  /** Human-readable display number in E.164 (e.g. +15551234567) for wa.me links. */
  displayNumber?: string
}): Promise<ActionResult> {
  const ctx = await requireAdmin()

  const displayNumber = input.displayNumber?.trim() ?? ''
  if (displayNumber && !/^\+[1-9]\d{7,14}$/.test(displayNumber)) {
    return { ok: false, message: 'Display number must be in E.164 format (e.g. +15551234567)' }
  }

  const svc = requireServiceClient()

  const { data: existing } = await svc
    .from('platform_integrations')
    .select('ciphertext, iv, auth_tag, metadata')
    .eq('provider', 'meta_whatsapp')
    .maybeSingle()

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'meta_whatsapp',
      ciphertext: existing?.ciphertext ?? null,
      iv: existing?.iv ?? null,
      auth_tag: existing?.auth_tag ?? null,
      metadata: {
        ...((existing?.metadata as object) ?? {}),
        phone_number_id: input.phoneNumberId.trim(),
        waba_id: input.wabaId.trim(),
        display_number: displayNumber,
      },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )

  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.save',
    targetType: 'integration',
    targetId: 'meta_whatsapp_config',
    metadata: {
      phone_number_id: input.phoneNumberId.trim(),
      waba_id: input.wabaId.trim(),
      display_number: displayNumber,
    },
  })

  return { ok: true }
}

/**
 * Save the platform-wide WhatsApp system-prompt addendum into
 * platform_integrations.meta_whatsapp metadata.system_prompt. Preserves the
 * existing encrypted token fields and merges with other metadata keys.
 * This text is appended to the estimate prompt ONLY for WhatsApp-channel
 * generation (see lib/services/generate-estimate.ts).
 */
export async function saveWhatsAppSystemPrompt(
  prompt: string
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const trimmed = prompt.trim()
  if (trimmed.length > 4000) {
    return { ok: false, message: 'System prompt must be 4000 characters or fewer.' }
  }

  const svc = requireServiceClient()
  const { data: existing } = await svc
    .from('platform_integrations')
    .select('ciphertext, iv, auth_tag, metadata')
    .eq('provider', 'meta_whatsapp')
    .maybeSingle()

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'meta_whatsapp',
      ciphertext: existing?.ciphertext ?? null,
      iv: existing?.iv ?? null,
      auth_tag: existing?.auth_tag ?? null,
      metadata: { ...((existing?.metadata as object) ?? {}), system_prompt: trimmed },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )
  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.save',
    targetType: 'integration',
    targetId: 'meta_whatsapp_system_prompt',
    metadata: { length: trimmed.length },
  })

  return { ok: true }
}

/**
 * Persist the platform-wide default OpenRouter model id. OpenRouter is the
 * single AI engine (see lib/ai/index.ts), so this is THE model used for any
 * company without an `ai_model_override`.
 *
 * Stored as `openrouter_default_model` in the `ai_config` metadata.
 */
export async function setGlobalOpenRouterModel(
  model: string
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const trimmed = model.trim()
  if (!trimmed) {
    return { ok: false, message: 'Model id is required' }
  }
  // Loose validation — OpenRouter model ids look like "vendor/slug" or
  // "vendor/slug:variant". Permissive on purpose so new vendors don't break.
  if (!/^[\w./:-]+$/.test(trimmed)) {
    return { ok: false, message: 'Invalid model id format' }
  }

  const svc = requireServiceClient()
  // Best-effort read so we preserve any unrelated ai_config keys (e.g. the
  // transcription_model) when writing the default model.
  let prevMeta: Record<string, unknown> = {}
  try {
    const { data: prev } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'ai_config')
      .maybeSingle()
    prevMeta = (prev?.metadata ?? {}) as Record<string, unknown>
  } catch {
    // non-fatal — overwrite with just the new model
  }

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'ai_config',
      ciphertext: null,
      iv: null,
      auth_tag: null,
      metadata: { ...prevMeta, openrouter_default_model: trimmed },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )
  if (error) {
    return { ok: false, message: error.message }
  }
  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'ai_provider.set_model',
    targetType: 'ai_config',
    targetId: 'openrouter',
    metadata: { model: trimmed, previous: prevMeta.openrouter_default_model ?? null },
  })

  return { ok: true, message: `Default OpenRouter model set to ${trimmed}.` }
}

/**
 * Persist the platform-wide speech-to-text model id. Transcription does NOT
 * route through OpenRouter (it calls OpenAI Whisper directly), so the choice is
 * restricted to the known OpenAI transcription models. Stored alongside
 * `openrouter_default_model` in the `ai_config` metadata.
 */
export async function setGlobalTranscriptionModel(
  model: string
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const trimmed = model.trim()
  if (!TRANSCRIPTION_MODELS.includes(trimmed as (typeof TRANSCRIPTION_MODELS)[number])) {
    return { ok: false, message: 'Unknown transcription model' }
  }

  const svc = requireServiceClient()
  let prevMeta: Record<string, unknown> = {}
  try {
    const { data: prev } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'ai_config')
      .maybeSingle()
    prevMeta = (prev?.metadata ?? {}) as Record<string, unknown>
  } catch {
    // non-fatal — overwrite with just the new model
  }

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'ai_config',
      ciphertext: null,
      iv: null,
      auth_tag: null,
      metadata: { ...prevMeta, transcription_model: trimmed },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )
  if (error) {
    return { ok: false, message: error.message }
  }
  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'ai_provider.set_transcription_model',
    targetType: 'ai_config',
    targetId: 'transcription',
    metadata: { model: trimmed, previous: prevMeta.transcription_model ?? null },
  })

  return { ok: true, message: `Speech-to-text model set to ${trimmed}.` }
}

/**
 * Configure the v4.6 price-research source (the deferred super-admin control).
 *
 * Upserts the `platform_integrations` row `provider='price_research'` with
 * `metadata = { research_source, research_engine }`. The readers query the DB
 * live (no redeploy):
 *   - getActiveResearchSource() (lib/estimate/price-research/provider.ts) activates
 *     ONLY on research_source ∈ { 'openrouter_web', 'anthropic_web' }; anything else
 *     (incl. null) → null → getPriceResearchProvider() returns null (dormant no-op).
 *   - resolveEngine() (adapters/openrouter-web.ts): research_engine 'native' literal, else 'exa'.
 *
 * DISABLE therefore persists research_source: null (a non-matching value) so the
 * readers go dormant while research_engine is preserved (re-enabling restores it).
 * Mirrors setGlobalOpenRouterModel: requireAdmin gate FIRST, service-role upsert,
 * invalidate cache + revalidate path + audit. No API key involved — price_research
 * reuses the existing OpenRouter / Anthropic credentials.
 */
export async function setPriceResearchSource(input: {
  enabled: boolean
  source: 'openrouter_web' | 'anthropic_web'
  engine: 'exa' | 'native'
}): Promise<ActionResult> {
  const ctx = await requireAdmin()

  if (input.source !== 'openrouter_web' && input.source !== 'anthropic_web') {
    return { ok: false, message: 'Invalid source' }
  }
  if (input.engine !== 'exa' && input.engine !== 'native') {
    return { ok: false, message: 'Invalid engine' }
  }

  const svc = requireServiceClient()

  // Best-effort read of existing metadata so we preserve any unrelated keys.
  let prevMeta: Record<string, unknown> = {}
  try {
    const { data: prev } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'price_research')
      .maybeSingle()
    prevMeta = (prev?.metadata ?? {}) as Record<string, unknown>
  } catch {
    // non-fatal — fall back to an empty metadata base
  }

  // ENABLE writes the activating source; DISABLE writes null (NON-matching) so
  // getActiveResearchSource() returns null → getPriceResearchProvider() resolves
  // null → the Phase-108 enrichment is a safe no-op. research_engine is preserved
  // either way so re-enabling restores the prior engine.
  const metadata = {
    ...prevMeta,
    research_source: input.enabled ? input.source : null,
    research_engine: input.engine,
  }

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'price_research',
      ciphertext: null,
      iv: null,
      auth_tag: null,
      metadata,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )
  if (error) {
    return { ok: false, message: error.message }
  }

  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'price_research.set',
    targetType: 'price_research',
    targetId: input.enabled ? input.source : 'disabled',
    metadata: { enabled: input.enabled, source: input.source, engine: input.engine },
  })

  return {
    ok: true,
    message: input.enabled
      ? `Price research enabled (${input.source}).`
      : 'Price research disabled.',
  }
}

/**
 * Save the v4.7 super-admin billing_config (BILLCFG-02 / BILLCFG-03).
 *
 * Upserts the metadata-only `platform_integrations` row `provider='billing_config'`
 * with the FULL {@link import('@/lib/schemas/admin').BillingConfigInput} shape so
 * every Phase 112-116 consumer reads real values. Mirrors setPriceResearchSource
 * exactly: requireAdmin gate FIRST (notFound for non-admins, before any DB write),
 * zod safeParse (validate-before-trust — invalid input returns ok:false with NO
 * upsert), service-role metadata-only upsert (all crypto columns explicitly null —
 * the existing CHECK permits that), then invalidatePlatformConfig() (runtime apply,
 * no deploy — flushes the billing TTL cache) + revalidatePath + audit.
 *
 * NEVER logs the raw config through logAdminAction beyond the targetType/targetId.
 */
export async function saveBillingConfig(input: unknown): Promise<ActionResult> {
  const ctx = await requireAdmin() // BILLCFG-03 gate — notFound() for non-admins, FIRST
  const parsed = billingConfigSchema.safeParse(input) // validate-before-trust
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid billing config' }
  }
  // CALIB-02 charge-on gate: enforcementEnabled may flip to true ONLY when the
  // incoming config satisfies the margin invariant (real cost of each priced
  // tier's full grant ≤ 30% of its price). Saving with enforcement OFF is never
  // gated — illustrative numbers are always saveable while charging is off.
  if (parsed.data.enforcementEnabled) {
    const check = validateMarginInvariant(parsed.data)
    if (!check.pass) {
      const failing = (Object.entries(check.tiers) as [string, TierMarginResult][])
        .filter(([, r]) => !r.skipped && !r.pass)
        .map(([name, r]) => `${name} (${(r.ratio * 100).toFixed(0)}% > 30%)`)
        .join(', ')
      return {
        ok: false,
        message: `Cannot enable charging: margin invariant fails for ${failing}. Lower the grant or raise the markup until the real cost of each tier's full grant is ≤ 30% of its price.`,
      }
    }
  }
  // Provision/refresh the real Stripe subscription Prices from the config dollar
  // amounts and merge the fresh ids back into the JSON we persist, so checkout
  // charges exactly what the panel shows (no Stripe dashboard, no deploy). This
  // NEVER blocks a save: a missing Stripe key no-ops (existing ids preserved),
  // and any thrown error is logged while the config still persists with the
  // pre-existing ids.
  //
  // ARCHIVE-AFTER-UPSERT ORDERING (bug fix): syncAllTierPrices only CREATES new
  // Prices here — it never archives the ones they supersede. If we archived
  // eagerly and the config upsert below then failed, the persisted config would
  // still point at Prices we had just archived, breaking every checkout for
  // that tier. Superseded ids are archived ONLY after the upsert succeeds.
  let supersededPriceIds: string[] = []
  try {
    const priceIds = await syncAllTierPrices(parsed.data)
    parsed.data.tiers.pro.stripePriceIdMonth = priceIds.pro.month
    parsed.data.tiers.pro.stripePriceIdYear = priceIds.pro.year
    parsed.data.tiers.business.stripePriceIdMonth = priceIds.business.month
    parsed.data.tiers.business.stripePriceIdYear = priceIds.business.year
    supersededPriceIds = priceIds.supersededPriceIds ?? []
  } catch (err) {
    console.error('[saveBillingConfig] Stripe price sync failed — persisting config with existing ids:', err instanceof Error ? err.message : err)
  }
  const svc = requireServiceClient()
  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'billing_config',
      ciphertext: null,
      iv: null,
      auth_tag: null, // metadata-only row (CHECK permits all-null crypto)
      metadata: parsed.data,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )
  if (error) return { ok: false, message: error.message }

  // Only now — config is durably persisted — best-effort archive the Prices
  // the sync above superseded. Never blocks or fails the save.
  if (supersededPriceIds.length > 0) {
    try {
      const stripe = await getStripeClient()
      await archivePrices(stripe, supersededPriceIds)
    } catch (err) {
      console.error(
        '[saveBillingConfig] failed to archive superseded Stripe Prices:',
        err instanceof Error ? err.message : err
      )
    }
  }

  invalidatePlatformConfig() // runtime apply, no deploy (flushes the billing TTL cache)
  invalidateStripeDisplayPricesCache() // fresh Stripe Price ids → re-resolve displayed prices
  revalidatePath('/admin/integrations')
  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'billing_config.save',
    targetType: 'billing_config',
    targetId: 'billing_config',
  })
  return { ok: true, message: 'Billing config saved.' }
}
