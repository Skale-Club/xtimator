/**
 * Phase 179 Plan 01 — Task 1.
 *
 * Pure, client-safe source of truth for the WhatsApp HSM body composer.
 *
 * ONE ordered `ComposerParam[]` array (label + example per position) plus a
 * body string carrying sequential `{{1}}..{{n}}` tokens is the ONLY input an
 * admin's composer UI ever needs — this module derives Meta's `BODY`
 * component shape (`text` + `example.body_text`) from that single array.
 * There must never be a second, independently-editable place that stores the
 * variable list or example values: letting a human free-type raw `{{n}}`
 * syntax (or edit examples separately from labels) reintroduces the
 * order-mismatch class of bug this phase's research flags as silent and
 * unrecoverable once Meta approves a template (179-RESEARCH.md Pitfall 3).
 *
 * No imports beyond TypeScript built-ins — no `fetch`, no server-only
 * modules — so a `'use client'` composer component (Plan 179-04) can import
 * this file directly. `validateComposerTemplate` mirrors Meta's documented
 * auto-reject rules (179-RESEARCH.md Pitfalls 1-2) so avoidable rejections
 * are caught locally before any network call, and it also rejects stray or
 * malformed curly braces outside a well-formed `{{n}}` token — this matters
 * because `submitTemplateToMeta` (Plan 179-03) re-validates STORED
 * `body_text`, a non-UI path where malformed braces can arrive independently
 * of this composer.
 */

export interface ComposerParam {
  label: string
  example: string
}

export interface ComposerValidationResult {
  valid: boolean
  errors: string[]
}

/** Meta's documented BODY component character limit (179-RESEARCH.md §Components doc). */
const BODY_CHAR_LIMIT = 1024

/** Matches a well-formed `{{n}}` variable token (one or more digits). */
const VARIABLE_TOKEN_RE = /\{\{(\d+)\}\}/g

/** Returns the next SEQUENTIAL token for the given ordered params array — a
 * caller can never accidentally skip or duplicate a position. */
export function nextVariableToken(params: ComposerParam[]): string {
  return `{{${params.length + 1}}}`
}

/**
 * Validates a body template + its ordered params against every Meta
 * auto-reject rule this module mirrors. Never throws; accumulates ALL
 * applicable errors into one array rather than short-circuiting on the first
 * failure, so an admin sees every problem in one pass.
 */
export function validateComposerTemplate(
  bodyTemplate: string,
  params: ComposerParam[]
): ComposerValidationResult {
  const errors: string[] = []
  const trimmed = bodyTemplate.trim()

  if (!trimmed) {
    errors.push('Body text is required.')
  }

  // Any '{{' or '}}' occurrence outside a well-formed {{n}} token is an
  // error (e.g. '{{}}', lone '{{1}', '{ {2}}') — strip every well-formed
  // token first, then anything left containing a brace is malformed.
  const withoutWellFormedTokens = trimmed.replace(VARIABLE_TOKEN_RE, '')
  if (/[{}]/.test(withoutWellFormedTokens)) {
    errors.push(
      'Body text contains malformed or stray curly braces — every "{{" and "}}" must form a well-formed {{n}} variable token.'
    )
  }

  // "Sequential" check: the extracted index sequence, in order of first
  // appearance, must equal [1, 2, ..., params.length] exactly — this single
  // comparison covers gaps, duplicates, reversal, and count mismatch.
  const tokenIndexes = [...trimmed.matchAll(VARIABLE_TOKEN_RE)].map((m) => Number(m[1]))
  const expectedIndexes = params.map((_, i) => i + 1)
  const isSequential =
    tokenIndexes.length === expectedIndexes.length &&
    tokenIndexes.every((idx, i) => idx === expectedIndexes[i])
  if (!isSequential) {
    errors.push(
      'Variable tokens must be sequential starting at {{1}} and match the number of parameters exactly (no gaps, duplicates, or reordering).'
    )
  }

  if (/^\{\{\d+\}\}/.test(trimmed)) {
    errors.push('Template body cannot start with a variable.')
  }
  if (/\{\{\d+\}\}$/.test(trimmed)) {
    errors.push('Template body cannot end with a variable.')
  }

  if (trimmed.length > BODY_CHAR_LIMIT) {
    errors.push(
      `Body text exceeds the ${BODY_CHAR_LIMIT}-character limit (currently ${trimmed.length}).`
    )
  }

  params.forEach((p, i) => {
    const position = i + 1
    const label = p.label?.trim()
    const example = p.example?.trim()
    if (!label) {
      errors.push(`Parameter {{${position}}} is missing a label.`)
    }
    if (!example) {
      errors.push(`Parameter {{${position}}} (${label || 'unlabeled'}) is missing an example value.`)
    }
  })

  return { valid: errors.length === 0, errors }
}

/**
 * Derives Meta's BODY component shape from the body template + ordered
 * params. Pure formatter — does NOT call `validateComposerTemplate` or throw
 * on invalid input; validation is the caller's separate, explicit
 * responsibility, so the composer UI can show a live derived preview even
 * while the admin is still mid-edit and technically invalid.
 */
export function buildBodyComponent(
  bodyTemplate: string,
  params: ComposerParam[]
): { type: 'BODY'; text: string; example: { body_text: string[][] } } {
  return {
    type: 'BODY',
    text: bodyTemplate.trim(),
    example: { body_text: [params.map((p) => (p.example ?? '').trim())] },
  }
}
