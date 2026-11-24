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
import { EVENT_CATEGORIES, isWhatsAppNotificationEvent } from '@/lib/notifications/event-types'
import { OWNER_UPDATE } from '@/lib/notifications/whatsapp-registry'
import {
  buildBodyComponent,
  validateComposerTemplate,
  type ComposerParam,
} from '@/lib/whatsapp/template-composer'
import {
  buildCreatePayload,
  createMetaTemplate,
  findMetaTemplateByName,
  updateMetaTemplate,
  mapMetaEventToStatus,
  type MetaTemplateDefinition,
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
  quick_reply_count?: number
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

function validateTemplateIdentity(
  name: string,
  language: string,
  event: string | null | undefined,
): string | null {
  if (!/^[a-z0-9_]{1,512}$/.test(name)) return 'Use lowercase letters, digits and underscores for the template name.'
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) return 'Use a Meta language code such as en_US, pt_BR or es.'
  if (event != null && !isWhatsAppNotificationEvent(event)) return 'Select an available notification event.'
  return null
}

function getTemplateCategory(event: string | null | undefined): string | null {
  return event && isWhatsAppNotificationEvent(event) ? EVENT_CATEGORIES[event] : null
}

function checkVariableCount(name: string, event: string | null | undefined, count: number): string | null {
  if (event && count !== 2) return 'Notification event templates must use {{1}} for the title and {{2}} for the details.'
  if (name === OWNER_UPDATE && count !== 1) return 'The owner update template must use one body variable.'
  return null
}

type MetaComponent = {
  type?: string
  format?: string
  text?: string
  example?: { body_text?: string[][] }
  buttons?: { type?: string; url?: string }[]
}

/** Sends can fill positional body parameters only. Fixed headers and buttons can travel with the template. */
function readMetaTemplateBody(template: MetaTemplateDefinition, event: string | null) {
  const components = template.components.filter(
    (value): value is MetaComponent => !!value && typeof value === 'object',
  )
  const body = components.find((component) => component.type === 'BODY')
  if (!body || typeof body.text !== 'string') return { error: 'Meta did not return a template body.' }
  let quickReplyCount = 0
  for (const component of components) {
    if (component.type === 'BODY' || component.type === 'FOOTER') continue
    if (component.type === 'HEADER' && component.format === 'TEXT' && !component.text?.includes('{{')) continue
    if (component.type === 'BUTTONS' && Array.isArray(component.buttons)) {
      if (!event && component.buttons.length === 1 && component.buttons[0]?.type === 'QUICK_REPLY') {
        quickReplyCount = 1
        continue
      }
      if (component.buttons.every((button) => button?.type === 'PHONE_NUMBER' ||
        (button?.type === 'URL' && typeof button.url === 'string' && !button.url.includes('{{')))) continue
    }
    return { error: 'This template uses a component that Xtimator cannot send.' }
  }

  const bodyText = body.text
  const count = [...bodyText.matchAll(/\{\{\d+\}\}/g)].length
  const labels = template.name === OWNER_UPDATE ? ['Summary'] : ['Title', 'Details']
  const params = Array.from({ length: count }, (_, index) => ({
    label: labels[index] ?? `Variable ${index + 1}`,
    example: body.example?.body_text?.[0]?.[index] || labels[index] || 'Example',
  }))
  const validation = validateComposerTemplate(bodyText, params)
  const error = checkVariableCount(template.name, event, count) ?? validation.errors[0]
  if (error) return { error }
  return { bodyText, params, quickReplyCount }
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
  const inputError = validateTemplateIdentity(input.template_name, input.language_code, input.event_type)
    ?? checkVariableCount(input.template_name, input.event_type, parseComposerParams(input.variables_schema).length)
  if (inputError) return { ok: false, error: inputError }
  const svc = requireServiceClient()
  const { data, error } = await svc
    .from(TABLE)
    .insert({
      template_name: input.template_name,
      language_code: input.language_code,
      event_category: getTemplateCategory(input.event_type) ?? input.event_category ?? null,
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

/** Import a Meta-approved variant and bind it to an exact notification event. */
export async function importApprovedTemplate(input: {
  template_name: string
  language_code: string
  event_type: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin()
  const { template_name: name, language_code: language, event_type: event } = input
  const inputError = validateTemplateIdentity(name, language, event)
  if (inputError) return { ok: false, error: inputError }

  const { accessToken, wabaId } = await getWhatsAppPlatformConfig()
  if (!accessToken || !wabaId) {
    return { ok: false, error: 'Configure the Meta access token and business account ID in Integrations first.' }
  }
  const result = await findMetaTemplateByName(wabaId, accessToken, name, language)
  if (!result.ok) return { ok: false, error: result.error }
  if (mapMetaEventToStatus(result.result.status) !== 'approved') {
    return { ok: false, error: 'Meta has not approved this exact template and language.' }
  }
  const parsed = readMetaTemplateBody(result.result, event)
  if ('error' in parsed) return { ok: false, error: parsed.error ?? 'This template cannot be sent.' }

  const svc = requireServiceClient()
  const byVariant = svc.from(TABLE).select('id').eq('template_name', name).eq('language_code', language)
  const { data: existing, error: readError } = await (event ? byVariant.eq('event_type', event) : byVariant.is('event_type', null))
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (readError) return { ok: false, error: 'Could not load the template registry.' }
  const template = {
    template_name: name,
    language_code: language,
    event_category: getTemplateCategory(event),
    event_type: event,
    meta_template_id: result.result.id,
    status: 'approved',
    rejection_reason: null,
    variables_schema: parsed.params,
    quick_reply_count: parsed.quickReplyCount,
    body_text: parsed.bodyText,
    updated_at: new Date().toISOString(),
  }
  const { error } = existing
    ? await svc.from(TABLE).update(template).eq('id', existing.id)
    : await svc.from(TABLE).insert({ ...template, created_by: admin.userId })
  if (error) return { ok: false, error: 'Could not save the approved template in the registry.' }
  return { ok: true }
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
    const countError = checkVariableCount(template.template_name, template.event_type, params.length)
    if (countError) return { ok: false, reason: 'invalid', error: countError }
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

    const { error: saveError } = await svc
      .from(TABLE)
      .update({
        meta_template_id: metaTemplateId,
        status: 'pending',
        variables_schema: params,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (saveError) return { ok: false, error: 'Meta accepted the template. Use Check status now to recover its registry entry.' }
    return { ok: true, metaTemplateId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
/**
 * On-demand Meta status check (Pattern 3) — independent of the async
 * webhook. Reconciles legacy or stale Meta IDs by the registry row's exact
 * template name and language under the configured WABA.
 */
export async function checkTemplateStatus(
  id: string
): Promise<
  | { ok: true; status: string; rejectionReason: string | null }
  | { ok: false; error?: string }
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
      return { ok: false, error: readErr?.message ?? 'Template not found' }
    }
    const template = row as TemplateRow

    const { accessToken, wabaId } = await getWhatsAppPlatformConfig()
    if (!accessToken || !wabaId) {
      return { ok: false, error: 'Configure the Meta access token and business account ID in Integrations first.' }
    }

    const result = await findMetaTemplateByName(wabaId, accessToken, template.template_name, template.language_code)
    if (!result.ok) {
      return { ok: false, error: `Meta status check failed ${result.status}: ${result.error}` }
    }

    let status = mapMetaEventToStatus(result.result.status)
    const definition = readMetaTemplateBody(result.result, template.event_type)
    const definitionError = 'error' in definition ? definition.error : undefined
    if (status === 'approved' && definitionError) status = 'incompatible'
    const rejectionReason = definitionError ?? result.result.rejectionReason
    const patch: Record<string, unknown> = {
      meta_template_id: result.result.id,
      status,
      rejection_reason: rejectionReason,
      updated_at: new Date().toISOString(),
    }
    if ('bodyText' in definition) {
      patch.body_text = definition.bodyText
      patch.variables_schema = definition.params
      patch.quick_reply_count = definition.quickReplyCount
    } else {
      patch.variables_schema = []
      patch.quick_reply_count = 0
    }
    const { error: saveError } = await svc.from(TABLE).update(patch).eq('id', id)
    if (saveError) return { ok: false, error: 'Could not save the status in the template registry.' }

    return { ok: true, status, rejectionReason }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Edit-and-resubmit (Pattern 4) for a rejected (or any existing) template:
 * validates the new body/params FIRST — before any DB read — then updates
 * the SAME Meta template in place (`POST /{template_id}`, not a new
 * template) and flips local status back to `pending` with the prior
 * `rejection_reason` cleared. Never throws.
 */
export async function updateTemplateAndResubmit(
  id: string,
  input: { body_text: string; variables_schema: ComposerParam[] }
): Promise<{ ok: true } | { ok: false; error?: string; errors?: string[] }> {
  try {
    await requireAdmin()

    const bodyText = (input.body_text ?? '').trim()
    const params = input.variables_schema ?? []
    const validation = validateComposerTemplate(bodyText, params)
    if (!validation.valid) {
      return { ok: false, errors: validation.errors }
    }

    const svc = requireServiceClient()

    const { data: row, error: readErr } = await svc
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single()
    if (readErr || !row) {
      return { ok: false, error: readErr?.message ?? 'Template not found' }
    }
    const template = row as TemplateRow
    const countError = checkVariableCount(template.template_name, template.event_type, params.length)
    if (countError) return { ok: false, errors: [countError] }

    if (!template.meta_template_id) {
      return { ok: false, error: 'Submit to Meta first before editing/resubmitting.' }
    }
    if (template.quick_reply_count) {
      return { ok: false, error: 'Edit quick-reply templates in Meta WhatsApp Manager, then check their status here.' }
    }

    const { accessToken } = await getWhatsAppPlatformConfig()
    if (!accessToken) {
      return { ok: false, error: 'Meta access token is not configured.' }
    }

    const bodyComponent = buildBodyComponent(bodyText, params)
    const result = await updateMetaTemplate(template.meta_template_id, accessToken, [
      bodyComponent,
    ])
    if (!result.ok) {
      return { ok: false, error: `Meta update failed ${result.status}: ${result.error}` }
    }

    const { error: saveError } = await svc
      .from(TABLE)
      .update({
        body_text: bodyText,
        variables_schema: params,
        status: 'pending',
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('meta_template_id', template.meta_template_id)

    if (saveError) return { ok: false, error: 'Meta accepted the update. Use Check status now to recover its registry entry.' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
