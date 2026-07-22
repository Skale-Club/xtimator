'use server'

/**
 * Phase 104 (104.3 — NOTIF-03) — super-admin WhatsApp notification-template
 * server actions.
 *
 * Manages the platform-level `whatsapp_notification_templates` registry (service-
 * role-only RLS — see migration 20260621000003). The panel lets a super-admin
 * register the Meta-approved HSM templates that back proactive owner WhatsApp
 * notifications, map them to a notification event/category, optionally submit them
 * to Meta programmatically, and track their approval status (flipped by the
 * `message_template_status_update` webhook → `applyTemplateStatusUpdate`).
 *
 * Auth posture:
 *  - listTemplates / createTemplate / submitTemplateToMeta are `requireAdmin`-gated
 *    (the service client bypasses RLS, so the admin gate is the real access control).
 *  - applyTemplateStatusUpdate is NOT admin-gated: it is called from the
 *    HMAC-verified WhatsApp webhook with a service client and must be best-effort.
 *
 * Secrets: the Meta access token + WABA id come from `getWhatsAppPlatformConfig()`
 * only — never hard-coded. NO secret literals in this file.
 */

import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { getWhatsAppPlatformConfig } from '@/lib/platform-config'
import {
  buildBodyComponent,
  validateComposerTemplate,
  type ComposerParam,
} from '@/lib/whatsapp/template-composer'
import {
  buildCreatePayload,
  createMetaTemplate,
  mapMetaEventToStatus,
} from '@/lib/whatsapp/meta-templates-client'

const TABLE = 'whatsapp_notification_templates'

export interface TemplateRow {
  id: string
  event_category: string | null
  event_type: string | null
  template_name: string
  language_code: string
  meta_template_id: string | null
  status: string
  rejection_reason: string | null
  variables_schema: unknown
  body_text: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateTemplateInput {
  template_name: string
  language_code: string
  event_category?: string | null
  event_type?: string | null
  variables_schema?: unknown
  body_text?: string
}

/**
 * Defensive parse of a stored `variables_schema` JSONB value into an ordered
 * `ComposerParam[]`. Never throws — legacy/malformed rows (e.g. a bare
 * label-string array from before this phase, or a non-array value) degrade
 * to `[]`, which then fails `validateComposerTemplate` with a clear error
 * rather than crashing `submitTemplateToMeta`/`updateTemplateAndResubmit`.
 */
function parseComposerParams(raw: unknown): ComposerParam[] {
  return Array.isArray(raw)
    ? raw.filter(
        (p): p is ComposerParam =>
          !!p &&
          typeof p === 'object' &&
          typeof (p as Record<string, unknown>).label === 'string' &&
          typeof (p as Record<string, unknown>).example === 'string'
      )
    : []
}

export interface TemplateStatusUpdateInput {
  message_template_id?: string
  template_name?: string
  language?: string
  event: string
  reason?: string
}

/** List every template row (admin only, service-role read). Newest first. */
export async function listTemplates(): Promise<TemplateRow[]> {
  await requireAdmin()
  const svc = requireServiceClient()
  const { data, error } = await svc
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[admin-whatsapp-templates] listTemplates error:', error.message)
    return []
  }
  return (data ?? []) as TemplateRow[]
}

/** Insert a new template row in `draft` status, attributed to the current admin. */
export async function createTemplate(
  input: CreateTemplateInput
): Promise<{ ok: boolean; row?: TemplateRow; error?: string }> {
  const admin = await requireAdmin()
  const svc = requireServiceClient()
  const { data, error } = await svc
    .from(TABLE)
    .insert({
      template_name: input.template_name,
      language_code: input.language_code,
      event_category: input.event_category ?? null,
      event_type: input.event_type ?? null,
      variables_schema: input.variables_schema ?? [],
      body_text: input.body_text ?? null,
      status: 'draft',
      created_by: admin.userId,
    })
    .select()
    .single()
  if (error) {
    console.error('[admin-whatsapp-templates] createTemplate error:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, row: data as TemplateRow }
}

/**
 * Programmatically submit a draft template to Meta for approval (de-risked MVP).
 *
 * Requires the platform Meta token to carry the `whatsapp_business_management`
 * scope and a WABA id. When either is absent — or Meta rejects the submit — this
 * returns a structured result and NEVER throws, so the panel can fall back to
 * "register an already-approved template manually" + the status webhook.
 */
export async function submitTemplateToMeta(
  id: string
): Promise<
  | { ok: true; metaTemplateId: string }
  | { ok: false; reason?: 'scope' | 'not_found' | 'invalid'; error?: string }
> {
  try {
    await requireAdmin()
    const svc = requireServiceClient()

    const { data: row, error: readErr } = await svc
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single()
    if (readErr || !row) {
      return { ok: false, reason: 'not_found', error: readErr?.message }
    }
    const template = row as TemplateRow

    // Validate the STORED body/params against Meta's auto-reject rules
    // BEFORE any network call — an incomplete draft (no body composed yet)
    // is refused here, never silently POSTed as components: [].
    const bodyText = (template.body_text ?? '').trim()
    const params = parseComposerParams(template.variables_schema)
    const validation = validateComposerTemplate(bodyText, params)
    if (!validation.valid) {
      return { ok: false, reason: 'invalid', error: validation.errors.join('; ') }
    }

    const { accessToken, wabaId } = await getWhatsAppPlatformConfig()
    // De-risked MVP: without a WABA id (or token) we cannot programmatically
    // submit. Surface `reason:'scope'` so the admin registers the already-approved
    // template by name and relies on the status webhook.
    if (!accessToken || !wabaId) {
      return { ok: false, reason: 'scope' }
    }

    const bodyComponent = buildBodyComponent(bodyText, params)
    const payload = buildCreatePayload({
      name: template.template_name,
      languageCode: template.language_code,
      bodyComponent,
    })
    const result = await createMetaTemplate(wabaId, accessToken, payload)

    if (!result.ok) {
      // A 403/permission error means the token lacks the management scope.
      if (result.status === 403) return { ok: false, reason: 'scope', error: result.error }
      return { ok: false, error: `Meta submit failed ${result.status}: ${result.error}` }
    }

    const metaTemplateId = result.id

    await svc
      .from(TABLE)
      .update({
        meta_template_id: metaTemplateId,
        status: 'pending',
        variables_schema: params,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return { ok: true, metaTemplateId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Apply a Meta `message_template_status_update` to the matching template row.
 *
 * Called from the HMAC-verified webhook with a service client — NO admin gate.
 * Best-effort: never throws. Matches by `meta_template_id` first, falling back to
 * `template_name` + `language_code`.
 */
export async function applyTemplateStatusUpdate(
  input: TemplateStatusUpdateInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const svc = requireServiceClient()

    const status = mapMetaEventToStatus(input.event)
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'rejected') {
      patch.rejection_reason = input.reason ?? null
    }

    let query = svc.from(TABLE).update(patch)
    if (input.message_template_id) {
      query = query.eq('meta_template_id', input.message_template_id)
    } else if (input.template_name) {
      query = query.eq('template_name', input.template_name)
      if (input.language) query = query.eq('language_code', input.language)
    } else {
      return { ok: false, error: 'no template identifier' }
    }

    const { error } = await query.select().single()
    if (error) {
      console.warn('[admin-whatsapp-templates] applyTemplateStatusUpdate error:', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err) {
    console.warn('[admin-whatsapp-templates] applyTemplateStatusUpdate threw:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
