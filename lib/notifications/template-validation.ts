/**
 * lib/notifications/template-validation.ts
 *
 * Phase 173 plan 01 (TMPL-04) — the ONE gate both the live client preview
 * (173-02) and the server actions (`saveNotificationTemplate`,
 * `sendTestNotification`) call before a template is ever persisted or
 * dispatched. A `{{var}}` reference not present in that event's
 * `EVENT_TEMPLATE_SEED[eventType].variables` whitelist is rejected, naming
 * every unknown variable.
 *
 * `admin.bonus_credits_granted`'s catalog is `[]` (CREDITUI-04 / Pitfall 5
 * guard in template-seed.ts) — ANY `{{var}}` reference for that event is
 * therefore structurally unknown. No special-casing here: it falls straight
 * out of the set-difference against an empty catalog.
 *
 * Client-bundle-safe: deliberately excludes Next.js's server-guard import
 * package — this module must be importable from the client-side editor
 * component in plan 173-02.
 */

import { extractVariables } from './template-engine'
import { getEventVariableCatalog } from './template-catalog'
import type { EventType } from './event-types'

export interface TemplateFieldInput {
  subject?: string | null
  title?: string | null
  body: string
}

export interface TemplateValidationResult {
  valid: boolean
  unknownVariables: string[]
  error?: string
}

/**
 * Matches ANY `{{...}}` pair, including malformed/non-word tokens that
 * `extractVariables()`'s strict `\w+`-only pattern does NOT parse (e.g.
 * `{{client.name}}`, `{{client-name}}`, `{{client name}}`).
 *
 * Plan-checker INFO-1 hardening: `extractVariables()` silently skips a
 * malformed token (by design — `template-engine.ts`'s render path is a
 * no-code-execution pass-through), which means a malformed token would
 * otherwise SAVE successfully and then render literally to a tenant
 * (`"Hello {{client.name}},"`). This broader pattern exists ONLY to catch
 * that residual-literal-braces case — it does not duplicate or replace
 * `extractVariables()`'s job of extracting the real, substitutable
 * variable names (that still comes from the engine's own function, no
 * regex duplication for the actual matching logic).
 */
const ANY_BRACE_PATTERN = /\{\{([^{}]*)\}\}/g

function collectRawBraceTokens(text: string): string[] {
  const tokens: string[] = []
  for (const match of text.matchAll(ANY_BRACE_PATTERN)) {
    tokens.push(match[1] ?? '')
  }
  return tokens
}

/**
 * Union of extractVariables() across subject+title+body, minus
 * getEventVariableCatalog(eventType), PLUS any residual `{{...}}` sequence
 * that isn't a clean, catalog-known `\w+` token (INFO-1 hardening).
 */
export function validateTemplateVariables(
  eventType: EventType,
  fields: TemplateFieldInput,
): TemplateValidationResult {
  const catalog = getEventVariableCatalog(eventType)
  const catalogSet = new Set(catalog)

  const fieldTexts = [fields.subject, fields.title, fields.body].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )

  const unknown = new Set<string>()

  for (const text of fieldTexts) {
    // The real, substitutable tokens — same extraction the render engine uses.
    for (const name of extractVariables(text)) {
      if (!catalogSet.has(name)) unknown.add(name)
    }
    // Any `{{...}}` pair at all, including ones extractVariables() can't
    // parse — a malformed token must never be saveable.
    for (const raw of collectRawBraceTokens(text)) {
      if (!/^\w+$/.test(raw) || !catalogSet.has(raw)) {
        unknown.add(raw)
      }
    }
  }

  const unknownVariables = Array.from(unknown)
  if (unknownVariables.length === 0) {
    return { valid: true, unknownVariables: [] }
  }

  const namedList = unknownVariables.map((name) => `{{${name}}}`).join(', ')
  const error =
    catalog.length === 0
      ? `Unknown variable${unknownVariables.length > 1 ? 's' : ''} ${namedList} — this event has no editable variables.`
      : `Unknown variable${unknownVariables.length > 1 ? 's' : ''} ${namedList} — not in the ${eventType} catalog (${catalog.join(', ')}).`

  return { valid: false, unknownVariables, error }
}
