import 'server-only'

/**
 * lib/whatsapp/meta-templates-client.ts
 *
 * Phase 179-02 (TMPLCOMP-02/03/04) — thin typed wrapper around Meta Graph
 * API's message-template MANAGEMENT endpoints (create / status / update),
 * mirroring lib/whatsapp/client.ts's "thin typed wrapper, no SDK" pattern
 * already proven for the messaging endpoints.
 *
 * This file takes no config of its own — every function receives an already-
 * resolved `accessToken`/`wabaId` from the caller (getWhatsAppPlatformConfig,
 * server-action-only) — but every function does a real `fetch` to Meta, so it
 * must never be reachable from a client bundle (`import 'server-only'`).
 *
 * Every fetch-calling function here NEVER throws — it returns a structured
 * `{ ok: true, ... } | { ok: false, status, error }` result instead, matching
 * the existing de-risked-MVP "NEVER throws" contract that
 * lib/actions/admin-whatsapp-templates.ts's submitTemplateToMeta relies on
 * (Plan 179-03 imports this module and deletes its own local duplicates,
 * including the narrower local mapMetaEventToStatus this widens).
 */

// Reuse the exact API-version resolution expression from lib/whatsapp/client.ts —
// never hardcode 'v21.0' a second time (179-RESEARCH.md Pitfall 5).
const GRAPH_BASE = `https://graph.facebook.com/${process.env.META_WHATSAPP_API_VERSION ?? 'v21.0'}`

export interface CreateTemplatePayloadInput {
  name: string
  languageCode: string
  bodyComponent: { type: 'BODY'; text: string; example: { body_text: string[][] } }
  category?: string
  allowCategoryChange?: boolean
}

/**
 * Build the real `POST /{waba-id}/message_templates` payload — replaces the
 * old `components: []` stub caller (submitTemplateToMeta, Plan 179-03).
 *
 * `allow_category_change` defaults to `false` (fail-closed) — 179-RESEARCH.md
 * Open Question 2: a locked design constraint, not a suggestion. Xtimator's
 * dispatch/consent logic elsewhere in this milestone treats UTILITY vs
 * MARKETING as meaningfully different for opt-in purposes (CUST-03/04), so
 * this module never lets Meta silently recategorize a template unless the
 * caller explicitly opts in.
 */
export function buildCreatePayload(input: CreateTemplatePayloadInput): Record<string, unknown> {
  return {
    name: input.name,
    category: input.category ?? 'UTILITY',
    language: input.languageCode,
    parameter_format: 'positional',
    allow_category_change: input.allowCategoryChange ?? false,
    components: [input.bodyComponent],
  }
}

/**
 * `POST /{wabaId}/message_templates` — submit a real template for Meta review.
 * Never throws: network errors, non-200 responses, and malformed-success
 * bodies (200 but missing `id`) all resolve to a structured `{ ok: false }`.
 */
export async function createMetaTemplate(
  wabaId: string,
  accessToken: string,
  payload: Record<string, unknown>
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text }
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    if (!body.id) {
      return { ok: false, status: res.status, error: 'Meta response missing template id' }
    }
    return { ok: true, id: body.id }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface MetaTemplateStatusResult {
  status: string
  qualityScore?: string
  rejectionReason: string | null
}

/**
 * Normalize Meta's rejection-reason field off a GET-by-id (or webhook) JSON
 * body. The exact field name is LOW confidence per research — checks
 * `rejected_reason` FIRST, then falls back to `rejection_reason`. Treats
 * `undefined`, empty string, and the literal `'NONE'` sentinel all as
 * "no reason" -> `null` (never returns Meta's literal `'NONE'` string as if
 * it were a real reason).
 */
export function extractRejectionReason(json: Record<string, unknown>): string | null {
  const candidates = [json.rejected_reason, json.rejection_reason]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0 && candidate !== 'NONE') {
      return candidate
    }
  }
  return null
}

/**
 * `GET /{templateId}?fields=status,quality_score,rejected_reason,rejection_reason`
 * On-demand status check (Pattern 3) — independent of the async webhook, used
 * for a "Check status now" panel action. Never throws.
 */
export async function getMetaTemplateStatus(
  templateId: string,
  accessToken: string
): Promise<
  { ok: true; result: MetaTemplateStatusResult } | { ok: false; status: number; error: string }
> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${templateId}?fields=status,quality_score,rejected_reason,rejection_reason`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text }
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const status = typeof body.status === 'string' ? body.status : ''
    const qualityScoreField = body.quality_score as { score?: string } | undefined
    return {
      ok: true,
      result: {
        status,
        qualityScore: qualityScoreField?.score,
        rejectionReason: extractRejectionReason(body),
      },
    }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * `POST /{templateId}` (the ITEM endpoint — Pattern 4, edit-and-resubmit).
 * Distinct from createMetaTemplate's COLLECTION endpoint
 * (`/{wabaId}/message_templates`): this hits the template itself, re-
 * triggering Meta review with the SAME `meta_template_id` (no new id).
 * Never throws.
 */
export async function updateMetaTemplate(
  templateId: string,
  accessToken: string,
  components: unknown[]
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${templateId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ components }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Map a Meta `message_template_status_update` webhook `event` (or the SAME-
 * vocabulary GET-by-id `status` field, per 179-RESEARCH.md) to our stored
 * status string.
 *
 * Widened from the original 4-case version (lib/actions/admin-whatsapp-
 * templates.ts, Plan 179-03 deletes that local copy) to cover the FULL
 * documented Meta event vocabulary (179-RESEARCH.md Pitfall 4) — PAUSED,
 * DISABLED, FLAGGED, and LOCKED each resolve to their OWN distinct,
 * non-approved status instead of silently collapsing through the
 * `event.toLowerCase()` passthrough the old version used for anything beyond
 * the happy path.
 *
 * UNARCHIVED and REINSTATED both map to 'approved': both are Meta
 * reactivation events for a template that was necessarily approved before
 * being archived/disabled — no research signal contradicts this, and it's
 * more useful to the panel/registry than an opaque distinct bucket
 * (Claude's discretion per 179-02-PLAN.md).
 *
 * The `default: event.toLowerCase()` fallback stays for forward-compat with
 * any future Meta event this plan didn't enumerate.
 */
export function mapMetaEventToStatus(event: string): string {
  switch (event.toUpperCase()) {
    case 'APPROVED':
    case 'UNARCHIVED':
    case 'REINSTATED':
      return 'approved'
    case 'REJECTED':
      return 'rejected'
    case 'PENDING':
    case 'PENDING_DELETION':
      return 'pending'
    case 'PAUSED':
      return 'paused'
    case 'DISABLED':
      return 'disabled'
    case 'FLAGGED':
      return 'flagged'
    case 'IN_APPEAL':
      return 'in_appeal'
    case 'LOCKED':
      return 'locked'
    case 'ARCHIVED':
      return 'archived'
    case 'LIMIT_EXCEEDED':
      return 'limit_exceeded'
    case 'DELETED':
      return 'deleted'
    default:
      return event.toLowerCase()
  }
}
