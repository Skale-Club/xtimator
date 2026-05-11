/**
 * Phase 51: WhatsApp pre-send edit command parser + dispatcher (SEED-015 Gap 1).
 *
 * Owners can refine the estimate via structured WhatsApp commands while in
 * `awaiting_confirm`, instead of canceling and starting over.
 *
 * Supported commands (case-insensitive):
 *
 *   send                                  → existing: deliver to client
 *   cancel                                → existing: discard and clean up
 *
 *   edit total 450                        → set estimate.total
 *   edit timeline "Job completes in 2 days"
 *                                         → set estimate.timeline
 *   edit payment "50% upfront, 50% on completion"
 *                                         → set estimate.payment_terms
 *   edit summary "Two-day deep clean"     → set estimate.summary
 *
 *   client "Maria Silva" +15552223333     → update project's linked client
 *                                           name + phone (creates client if none)
 *
 *   regenerate                            → rebuild estimate from same input
 *
 * Unrecognized commands return { kind: 'help' } so the caller can send a
 * help message back via WhatsApp.
 *
 * Section/item-level editing (`edit item 2.3 price 85`, `add item ...`,
 * `remove item ...`) is deferred — needs the confirmation message to include
 * numbered references first. Tracked as follow-up in 51-SUMMARY.md.
 */

export type ParsedCommand =
  | { kind: 'send' }
  | { kind: 'cancel' }
  | { kind: 'edit-total'; value: number }
  | { kind: 'edit-timeline'; value: string }
  | { kind: 'edit-payment'; value: string }
  | { kind: 'edit-summary'; value: string }
  | { kind: 'set-client'; name: string; phone: string }
  | { kind: 'regenerate' }
  | { kind: 'help' }

const QUOTED_PATTERN = /["“”'']([^"“”'']+)["“”'']/

/**
 * Parse a WhatsApp message body into a structured command.
 * Returns { kind: 'help' } for any unrecognized input.
 */
export function parseEditCommand(textBody: string): ParsedCommand {
  const trimmed = textBody.trim()
  if (trimmed.length === 0) return { kind: 'help' }

  // Normalize: lowercase the FIRST word (the verb), preserve case of args.
  // E.g., 'Edit Timeline "Job"' → ['edit', 'Timeline', '"Job"']
  const firstSpace = trimmed.indexOf(' ')
  const head = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)
  const tail = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim()
  const verb = head.toLowerCase().replace(/[^\w]/g, '')

  if (verb === 'send') return { kind: 'send' }
  if (verb === 'cancel') return { kind: 'cancel' }
  if (verb === 'regenerate' || verb === 'regen') return { kind: 'regenerate' }

  if (verb === 'edit') {
    return parseEditSubcommand(tail)
  }

  if (verb === 'client') {
    return parseClientCommand(tail)
  }

  return { kind: 'help' }
}

function parseEditSubcommand(args: string): ParsedCommand {
  // Format: <field> <value>
  // Fields supported: total, timeline, payment, summary
  const spaceAt = args.indexOf(' ')
  if (spaceAt === -1) return { kind: 'help' }

  const field = args.slice(0, spaceAt).toLowerCase()
  const rawValue = args.slice(spaceAt + 1).trim()
  if (!rawValue) return { kind: 'help' }

  if (field === 'total') {
    // Accept "450", "$450", "$450.99", "450.99"
    const numeric = rawValue.replace(/[$,\s]/g, '')
    const parsed = parseFloat(numeric)
    if (!Number.isFinite(parsed) || parsed < 0) return { kind: 'help' }
    return { kind: 'edit-total', value: parsed }
  }

  if (field === 'timeline' || field === 'payment' || field === 'summary') {
    const value = extractQuotedOrRest(rawValue)
    if (!value) return { kind: 'help' }
    if (field === 'timeline') return { kind: 'edit-timeline', value }
    if (field === 'payment') return { kind: 'edit-payment', value }
    return { kind: 'edit-summary', value }
  }

  return { kind: 'help' }
}

function parseClientCommand(args: string): ParsedCommand {
  // Format: client "Name with spaces" phoneNumber
  // Examples:
  //   client "Maria Silva" +15552223333
  //   client "Joe" 5552223333
  const quoted = args.match(QUOTED_PATTERN)
  if (!quoted) return { kind: 'help' }

  const name = quoted[1].trim()
  const remainder = args.slice(quoted.index! + quoted[0].length).trim()
  if (!name || !remainder) return { kind: 'help' }

  // Phone: normalize the ENTIRE remainder (strips parens/spaces/dashes).
  // E.g. "(555) 222-3333" → "+5552223333"
  const phone = normalizePhone(remainder)
  if (!phone) return { kind: 'help' }

  return { kind: 'set-client', name, phone }
}

function extractQuotedOrRest(raw: string): string | null {
  const match = raw.match(QUOTED_PATTERN)
  if (match) return match[1].trim()
  // No quotes — take the rest of the line as the value
  return raw.trim() || null
}

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return null
  // E.164: leading + optional, 7-15 digits
  const withPlus = cleaned.startsWith('+') ? cleaned : `+${cleaned}`
  const digits = withPlus.slice(1)
  if (digits.length < 7 || digits.length > 15 || !/^\d+$/.test(digits)) return null
  return withPlus
}

/**
 * User-facing help text shown on unknown commands.
 */
export const EDIT_HELP_MESSAGE = `Available commands:

*send* — deliver to client
*cancel* — discard estimate

*edit total* 450
*edit timeline* "Job in 2 days"
*edit payment* "50% upfront, 50% on completion"
*edit summary* "Two-day deep clean"

*client* "Maria Silva" +15552223333

*regenerate* — rebuild from same input`
