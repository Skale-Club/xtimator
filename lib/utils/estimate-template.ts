/**
 * Pure template utility for plain-text estimate generation.
 * No DB calls, no React imports. Fully unit-testable.
 * Phase 25 imports resolveTemplate() to render the Plain Text tab.
 */

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
