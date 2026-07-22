/**
 * lib/notifications/template-engine.ts
 *
 * Phase 172 (TMPL-07) — the ONE shared `{{var}}` interpolator + per-channel output
 * escaping primitive every template-consuming plan in this milestone imports
 * (172-03's DB-template resolver, Phase 173's live preview, Phase 174's call-site
 * sweep).
 *
 * LOCKED decision (research/STACK.md, research/PITFALLS.md): no templating
 * library. Handlebars (and any engine that executes registered helper code
 * against the template *source*) was rejected — templates become DB-stored and
 * admin-editable this milestone, a lower-trust-than-source-code surface, and
 * Handlebars' helper/partial execution model carries real CVE history against
 * exactly that kind of input. A hand-rolled `{{var}}` substitution regex has no
 * code-execution surface: a malformed/unmatched brace just fails to match and
 * passes through as literal text.
 *
 * Two escaping contexts — the VALUE is escaped, never the template text:
 *   - 'html'  (email body, Telegram HTML) -> escapeHtmlValue: HTML-entity-escape
 *     &, <, >, ", ' so an injected value can never inject markup.
 *   - 'text'  (SMS, in-app) -> escapeTextValue: strip control chars (incl.
 *     \r\n\t), collapse runs of 2+ spaces to one, trim. NO HTML-entity escaping
 *     — a plain-text channel must never show a literal '&amp;'.
 *
 * WhatsApp HSM `{{n}}` positional params are a THIRD, separate context handled
 * by sanitizeWhatsAppParam here, but the actual named-var -> ordered-`{{n}}`-array
 * rendering stays in whatsapp-registry.ts (untouched by this plan) — HSM bodies
 * are Meta-approved and immutable post-approval, so there is no free-text
 * `renderTemplate` call for WhatsApp; only the individual parameter VALUES need
 * this module's sanitization before they reach Meta (closed in lib/whatsapp/client.ts).
 */

export type RenderChannel = 'html' | 'text'
export type TemplateVars = Record<string, string | number | undefined | null>

/** Matches `{{word}}` tokens. \w+ (word chars only) is why a malformed/nested
 *  case like '{{{{name}}}}' resolves to the innermost complete match only —
 *  the leftover outer braces are not word chars and pass through literally. */
const VAR_PATTERN = /\{\{(\w+)\}\}/g

/** HTML-entity-escape one value: &, <, >, ", ' — mirrors
 *  lib/email/notification-emails.ts's escapeHtml() escaped-character set. */
export function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Plain-text sanitize one value for SMS/in-app: strip control chars
 *  (including \r\n\t), collapse runs of 2+ spaces to one, trim. NO
 *  HTML-entity escaping — SMS must never show a literal '&amp;'. */
export function escapeTextValue(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** Sanitize ONE WhatsApp HSM {{n}} positional parameter: Meta rejects/mishandles
 *  newlines, tabs, 4+ consecutive spaces, and leading/trailing whitespace
 *  (research/STACK.md, Pitfall 3 context). Collapses to 3 spaces (under Meta's
 *  reject threshold), not fully to 1 — preserves intentional visual spacing. */
export function sanitizeWhatsAppParam(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim()
}

/** Extract the ordered UNIQUE list of {{var}} names referenced in a template
 *  string (feeds the future admin-editor variable catalog, TMPL-03 — build
 *  now, no consumer yet). */
export function extractVariables(template: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const match of template.matchAll(VAR_PATTERN)) {
    const name = match[1]!
    if (!seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }
  return result
}

/**
 * Substitute every {{var}} token in `template` with `vars[var]`, escaping the
 * VALUE (never the template text) per `channel`. Missing/undefined/null -> ''.
 * Never throws — a malformed/unmatched '{{' with no closing '}}' just fails
 * the regex and passes through as literal text (no code execution risk, just
 * literal output).
 */
export function renderTemplate(
  template: string,
  vars: TemplateVars,
  channel: RenderChannel,
): string {
  const escape = channel === 'html' ? escapeHtmlValue : escapeTextValue
  return template.replace(VAR_PATTERN, (_match, name: string) => {
    const raw = vars[name]
    if (raw === undefined || raw === null) return ''
    return escape(String(raw))
  })
}
