'use server'

import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/auth/admin-context'
import { createServiceClient } from '@/lib/supabase/service'
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
  const svc = createServiceClient()
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
  return { ok: true }
}

/**
 * Delete a platform integration row entirely. Features that depend on the
 * provider will fall back to the env var (if set) or 503 (D-15).
 */
export async function deleteIntegrationKey(input: {
  provider: IntegrationProvider
}): Promise<ActionResult> {
  await requireAdmin()
  const svc = createServiceClient()
  const { error } = await svc
    .from('platform_integrations')
    .delete()
    .eq('provider', input.provider)
  if (error) {
    return { ok: false, message: error.message }
  }
  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')
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
}): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const key = await getIntegrationKey(input.provider)
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

    // Exhaustiveness fallback (TS narrows above; defensive)
    return { ok: false, message: `Unknown provider: ${String(input.provider)}` }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return { ok: false, message }
  }
}
