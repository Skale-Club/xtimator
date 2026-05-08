/**
 * Pure template utility for plain-text estimate generation.
 * No DB calls, no React imports. Fully unit-testable.
 * Phase 25 imports resolveTemplate() to render the Plain Text tab.
 */

import type { EstimateWithSections } from '@/lib/queries/estimate'
import { formatCurrency } from '@/lib/utils/format'

export interface TemplateData {
  client_name: string
  company_name: string
  owner_name: string
  total: string          // pre-formatted, e.g. "$1,250.00"
  items_breakdown: string // multi-line text block built by Phase 25 caller
}

export interface EstimateTemplate {
  greeting: string | null
  opener: string | null
  closer: string | null
  signature: string | null
}

export const TEMPLATE_DEFAULTS = {
  greeting: 'Hey {client_name},',
  opener: "Thank you for reaching out to {company_name}! Here is your estimate:",
  closer: "Let me know if you have any questions or would like to schedule an appointment. I'd be happy to assist you!",
  signature: 'Best regards,\n{owner_name}\n{company_name}',
} as const

/**
 * Replace known {variable} placeholders. Unknown placeholders pass through unchanged.
 */
function substitute(template: string, data: TemplateData): string {
  return template
    .replace(/\{client_name\}/g, data.client_name || '')
    .replace(/\{company_name\}/g, data.company_name || '')
    .replace(/\{owner_name\}/g, data.owner_name || '')
    .replace(/\{total\}/g, data.total || '')
    .replace(/\{items_breakdown\}/g, data.items_breakdown || '')
}

/**
 * Assemble the full plain-text estimate from the stored template (NULL fields use defaults)
 * and the render-time data. items_breakdown is always injected between opener and closer —
 * its position is fixed by this function, not by any template string.
 *
 * Empty string fields are treated as NULL (missing = revert to default).
 */
export function resolveTemplate(template: EstimateTemplate, data: TemplateData): string {
  const resolved = {
    greeting:  (template.greeting  || null) ?? TEMPLATE_DEFAULTS.greeting,
    opener:    (template.opener    || null) ?? TEMPLATE_DEFAULTS.opener,
    closer:    (template.closer    || null) ?? TEMPLATE_DEFAULTS.closer,
    signature: (template.signature || null) ?? TEMPLATE_DEFAULTS.signature,
  }

  const parts = [
    substitute(resolved.greeting, data),
    '',
    substitute(resolved.opener, data),
    '',
    data.items_breakdown,
    '',
    substitute(resolved.closer, data),
    '',
    substitute(resolved.signature, data),
  ]

  return parts.join('\n')
}

/**
 * Build the items_breakdown string for use in resolveTemplate().
 * Format (per D-02 / SEED-004):
 *   [Section Title]
 *   Item description: $120.00
 *
 *   [Next Section]
 *   Item description: $85.00
 *
 * Sections with no items are filtered out. Empty estimate returns ''.
 */
export function buildItemsBreakdown(estimate: EstimateWithSections): string {
  return estimate.sections
    .filter((section) => section.items.length > 0)
    .map((section) => {
      const header = `[${section.title}]`
      const items = section.items
        .map((item) => `${item.description}: ${formatCurrency(item.total)}`)
        .join('\n')
      return `${header}\n${items}`
    })
    .join('\n\n')
}
