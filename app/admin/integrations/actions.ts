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
  invalidatePlatformConfig,
  type IntegrationProvider,
} from '@/lib/platform-config'
import { integrationKeySchema } from '@/lib/schemas/admin'

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
        from: 'onboarding@resend.dev',
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
 * Upsert the ai_config row in platform_integrations to switch the active AI
 * provider platform-wide. No redeploy required — factory reads from DB on every
 * request (D-04, D-19).
 */
export async function setActiveAIProvider(
  provider: 'anthropic' | 'gemini' | 'openrouter'
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()

  // Best-effort read of previous metadata so we keep `openrouter_default_model`
  // intact when switching providers (we only want to flip selected_ai_provider).
  let previous: string | null = null
  let prevMeta: { selected_ai_provider?: string; openrouter_default_model?: string } = {}
  try {
    const { data: prev } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'ai_config')
      .maybeSingle()
    prevMeta =
      (prev?.metadata ?? {}) as {
        selected_ai_provider?: string
        openrouter_default_model?: string
      }
    previous = prevMeta.selected_ai_provider ?? null
  } catch {
    // non-fatal — audit row will just record { new } without previous
  }

  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'ai_config',
      ciphertext: null,
      iv: null,
      auth_tag: null,
      metadata: { ...prevMeta, selected_ai_provider: provider },
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
    action: 'ai_provider.set',
    targetType: 'ai_config',
    targetId: provider,
    metadata: { new: provider, previous },
  })

  return { ok: true, message: `Active AI provider set to ${provider}.` }
}

/**
 * Persist the platform-wide default OpenRouter model id. Used when the
 * active provider is OpenRouter and a company has no `ai_model_override`.
 *
 * Stored alongside `selected_ai_provider` in the `ai_config` metadata.
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
  let prevMeta: { selected_ai_provider?: string; openrouter_default_model?: string } = {}
  try {
    const { data: prev } = await svc
      .from('platform_integrations')
      .select('metadata')
      .eq('provider', 'ai_config')
      .maybeSingle()
    prevMeta =
      (prev?.metadata ?? {}) as {
        selected_ai_provider?: string
        openrouter_default_model?: string
      }
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
