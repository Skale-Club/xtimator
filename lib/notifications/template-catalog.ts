/**
 * lib/notifications/template-catalog.ts
 *
 * Phase 173 plan 01 (TMPL-02 / TMPL-03) — client-safe event/variable catalog
 * for the super-admin template editor. Derived entirely from the Phase 172
 * seed (`EVENT_TEMPLATE_SEED`) + `EVENT_CATEGORIES` — no independent data,
 * so it can never drift from the canonical variable whitelist.
 *
 * Client-bundle-safe: deliberately excludes Next.js's server-guard import
 * package — this module must be importable from the client-side editor
 * component in plan 173-02.
 *
 * Scope fence (173-01): `TENANT_TEMPLATE_CATALOG` covers `scope='tenant'`
 * only. No `scope='customer'` catalog exists yet — that is Phase 177.
 */

import { EVENT_TEMPLATE_SEED } from './template-seed'
import { EVENT_CATEGORIES, type EventType, type EventCategory } from './event-types'
import type { TemplateChannel } from './template-resolver'

/** WhatsApp is excluded — FUT-01 defers HSM body editing to a future phase. */
export const EDITABLE_CHANNELS: TemplateChannel[] = ['in_app', 'email', 'sms']

export interface TemplateCatalogEntry {
  eventType: EventType
  category: EventCategory
  label: string
  /** The variable whitelist for this event — the ONE source `validateTemplateVariables` diffs against. */
  variables: string[]
}

export const TENANT_TEMPLATE_CATALOG: TemplateCatalogEntry[] = (
  Object.keys(EVENT_TEMPLATE_SEED) as EventType[]
).map((eventType) => ({
  eventType,
  category: EVENT_CATEGORIES[eventType],
  label: EVENT_TEMPLATE_SEED[eventType].title,
  variables: EVENT_TEMPLATE_SEED[eventType].variables,
}))

export function getEventVariableCatalog(eventType: EventType): string[] {
  return EVENT_TEMPLATE_SEED[eventType].variables
}
