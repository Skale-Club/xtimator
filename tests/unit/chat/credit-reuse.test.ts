/**
 * Static credit-reuse regression for app/api/chat/route.ts (CHATMETER-01).
 *
 * Pitfall 4 — the chat REUSES the existing generation debit. Estimate generation
 * debits credits inside the Inngest job's `record-credit-debit` step
 * (lib/inngest/functions/generate-estimate.ts → recordCreditDebit); per v4.7 the
 * conversation turn itself is ABSORBED (no per-message charge). Adding any debit
 * in the /api/chat route would either DOUBLE-charge a generation (the job already
 * debits) or WRONGLY charge the conversation. This invariant is enforced by
 * ABSENCE, so a static source assertion is the right shape: it has no model, no
 * network, and it fails loudly the moment someone wires a debit into the route.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROUTE_PATH = resolve(process.cwd(), 'app/api/chat/route.ts')

/** Credit-mutation identifiers the route must NEVER contain. */
const FORBIDDEN_DEBIT_TOKENS = [
  'recordCreditDebit',
  'grantCredits',
  'consumeCredits',
] as const

describe('app/api/chat/route.ts — no credit debit (CHATMETER-01)', () => {
  const source = readFileSync(ROUTE_PATH, 'utf8')

  it.each(FORBIDDEN_DEBIT_TOKENS)(
    'does not call %s (generation debits inside the Inngest job; the conversation is absorbed)',
    (token) => {
      expect(source.includes(token)).toBe(false)
    },
  )

  it('does not import a debit symbol from @/lib/billing/credit-ledger', () => {
    // The route may legitimately read other modules, but it must not pull a debit
    // helper. The forbidden-token check above already covers the call site; this
    // additive guard catches a stray import even before a call is wired.
    const importsDebit = /from\s+['"]@\/lib\/billing\/credit-ledger['"]/.test(source)
      && FORBIDDEN_DEBIT_TOKENS.some((t) => source.includes(t))
    expect(importsDebit).toBe(false)
  })
})
