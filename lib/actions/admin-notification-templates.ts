'use server'

/**
 * lib/actions/admin-notification-templates.ts
 *
 * Phase 173 plan 01 (TMPL-02 / TMPL-04 / TMPL-05) — super-admin
 * notification-template server actions. Mirrors
 * `lib/actions/admin-whatsapp-templates.ts`'s CRUD shape: `requireAdmin`
 * first, service-role client (RLS-bypassing) second, never throw.
 *
 * Manages the `notification_templates` table (Phase 172,
 * `UNIQUE (scope, event_type, channel)`). `saveNotificationTemplate` runs
 * `validateTemplateVariables` BEFORE ever touching the service client — an
 * unknown-variable body is rejected without a DB write (TMPL-04's real
 * enforcement point). `sendTestNotification` renders against
 * `SAMPLE_COPY_CONTEXT` and dispatches to exactly one real transport
 * (Resend / Twilio SMS / the platform Telegram ops channel) chosen by
 * `target`, never throwing regardless of provider failure.
 *
 * Test-send recipients are intentionally narrow: `admin.email` (email),
 * the admin-typed `toPhone` (sms — platform-admin trust tier, not the
 * customer messaging service, still E.164-validated), or the already-
 * configured ops Telegram chat_id (telegram, no admin input). This action
 * never sends to a tenant or end customer.
 */

import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { logAdminAction } from '@/lib/admin/audit-log'
import { validateTemplateVariables } from '@/lib/notifications/template-validation'
import { EVENT_TEMPLATE_SEED } from '@/lib/notifications/template-seed'
import { SAMPLE_COPY_CONTEXT } from '@/lib/notifications/sample-context'
import { renderTemplate, type TemplateVars, type RenderChannel } from '@/lib/notifications/template-engine'
import { getIntegrationKey } from '@/lib/platform-config'
import { emailFrom } from '@/lib/email/sender'
import { sendSms } from '@/lib/sms/client'
import { sendTelegramMessage } from '@/lib/telegram/client'
import type { TemplateScope, TemplateChannel } from '@/lib/notifications/template-resolver'
import type { EventType } from '@/lib/notifications/event-types'

const TABLE = 'notification_templates'

/** Same E.164 shape enforced elsewhere in the repo (send-sms/send-whatsapp routes, integrations actions). */
const E164_RE = /^\+[1-9]\d{7,14}$/

export interface NotificationTemplateRow {
  id: string
  scope: TemplateScope
  event_type: string
  channel: TemplateChannel
  subject: string | null
  title: string | null
  body: string
  variables: unknown
  is_active: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

/** List every template row for a scope (admin only, service-role read). */
export async function listNotificationTemplates(scope: TemplateScope): Promise<NotificationTemplateRow[]> {
  await requireAdmin()
  const svc = requireServiceClient()
  const { data, error } = await svc
    .from(TABLE)
    .select('*')
    .eq('scope', scope)
    .order('event_type', { ascending: true })

  if (error) {
    console.error('[admin-notification-templates] listNotificationTemplates error:', error.message)
    return []
  }
  return (data ?? []) as NotificationTemplateRow[]
}

export interface SaveTemplateInput {
  scope: TemplateScope
  eventType: EventType
  channel: TemplateChannel
  subject?: string | null
  title?: string | null
  body: string
  isActive: boolean
}

/**
 * Validates BEFORE touching the service client — an unknown `{{var}}`
 * reference returns `{ok:false, error}` without ever calling `upsert`
 * (TMPL-04's real, server-side enforcement point).
 */
export async function saveNotificationTemplate(
  input: SaveTemplateInput,
): Promise<{ ok: boolean; error?: string; row?: NotificationTemplateRow }> {
  const admin = await requireAdmin()

  const validation = validateTemplateVariables(input.eventType, {
    subject: input.subject,
    title: input.title,
    body: input.body,
  })
  if (!validation.valid) {
    return { ok: false, error: validation.error }
  }

  const svc = requireServiceClient()
  const { data, error } = await svc
    .from(TABLE)
    .upsert(
      {
        scope: input.scope,
        event_type: input.eventType,
        channel: input.channel,
        subject: input.channel === 'email' ? (input.subject ?? null) : null,
        title: input.channel === 'in_app' ? (input.title ?? null) : null,
        body: input.body,
        // Canonical whitelist — always from the seed, never from client input.
        variables: EVENT_TEMPLATE_SEED[input.eventType].variables,
        is_active: input.isActive,
        updated_by: admin.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'scope,event_type,channel' },
    )
    .select()
    .single()

  if (error) {
    console.error('[admin-notification-templates] saveNotificationTemplate error:', error.message)
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/notifications')
  void logAdminAction({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: 'notification_template.save',
    targetType: 'notification_template',
    targetId: `${input.scope}:${input.eventType}:${input.channel}`,
    metadata: { eventType: input.eventType, channel: input.channel, isActive: input.isActive },
  })

  return { ok: true, row: data as NotificationTemplateRow }
}

export type TestSendTarget = 'email' | 'sms' | 'telegram'

export interface SendTestInput {
  eventType: EventType
  subject?: string | null
  title?: string | null
  body: string
  target: TestSendTarget
  /** Required only when target === 'sms'. Admin-typed, must be E.164. */
  toPhone?: string
}

/**
 * Renders the in-progress (possibly unsaved) fields against
 * `SAMPLE_COPY_CONTEXT[eventType]` and dispatches to exactly ONE real
 * transport. Never throws — every failure path (unconfigured provider,
 * bad input, thrown client) returns `{ok:false, message}`.
 */
export async function sendTestNotification(
  input: SendTestInput,
): Promise<{ ok: boolean; message?: string }> {
  const admin = await requireAdmin()

  // Defense-in-depth: the editor UI should never let an invalid body reach
  // here, but this is the real gate (mirrors saveNotificationTemplate).
  const validation = validateTemplateVariables(input.eventType, {
    subject: input.subject,
    title: input.title,
    body: input.body,
  })
  if (!validation.valid) {
    return { ok: false, message: validation.error }
  }

  const mode: RenderChannel = input.target === 'sms' ? 'text' : 'html'
  const sampleCtx = SAMPLE_COPY_CONTEXT[input.eventType] as unknown as TemplateVars

  const renderedBody = renderTemplate(input.body, sampleCtx, mode).trim()
  if (!renderedBody) {
    return {
      ok: false,
      message: 'The rendered message is empty against sample data — cannot send a blank test.',
    }
  }
  const renderedSubject = input.subject ? renderTemplate(input.subject, sampleCtx, mode).trim() : ''
  const renderedTitle = input.title ? renderTemplate(input.title, sampleCtx, mode).trim() : ''

  let result: { ok: boolean; message?: string }

  if (input.target === 'email') {
    const key = await getIntegrationKey('resend')
    if (!key) {
      result = { ok: false, message: 'Resend is not configured for this platform.' }
    } else {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(key)
        const label = renderedSubject || renderedTitle || EVENT_TEMPLATE_SEED[input.eventType].title
        await resend.emails.send({
          from: emailFrom('Xtimator (Test)'),
          to: admin.email,
          subject: `[TEST] ${label}`,
          html: renderedBody,
        })
        result = { ok: true }
      } catch (e) {
        result = { ok: false, message: e instanceof Error ? e.message : 'Unknown error' }
      }
    }
  } else if (input.target === 'sms') {
    if (!input.toPhone) {
      result = { ok: false, message: 'A phone number is required to send a test SMS.' }
    } else if (!E164_RE.test(input.toPhone)) {
      result = { ok: false, message: 'Phone number must be in E.164 format, e.g. +15551234567.' }
    } else {
      const smsResult = await sendSms(input.toPhone, renderedBody)
      result = smsResult.ok ? { ok: true } : { ok: false, message: smsResult.error }
    }
  } else {
    try {
      await sendTelegramMessage(renderedBody)
      result = { ok: true }
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : 'Unknown error' }
    }
  }

  void logAdminAction({
    actorId: admin.userId,
    actorEmail: admin.email,
    action: 'notification_template.test_send',
    targetType: 'notification_template',
    targetId: `${input.eventType}:${input.target}`,
    metadata: { target: input.target, ok: result.ok },
  })

  return result
}
