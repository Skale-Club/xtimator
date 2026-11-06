/**
 * Chat metering regression for app/api/chat/route.ts (SEED-055 Phase D, D3).
 *
 * The chat is available on every plan and each turn costs credits:
 *   - exactly ONE `chat` debit per turn, from the conversation's own measured
 *     model cost, under a per-turn attempt id;
 *   - NONE on the 402 path (credit gate fires before any model is built);
 *   - never double-charging: estimate generation debits itself inside its
 *     Inngest job, so the route must not debit an estimate/generation op.
 *
 * Behaviour is exercised in tests/unit/chat/route.test.ts; this file pins the
 * static shape that keeps those guarantees from regressing.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Strip comments so the header prose cannot satisfy (or break) the assertions.
const source = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

function count(re: RegExp): number {
  return (source.match(re) ?? []).length
}

describe('app/api/chat/route.ts - metered chat turn', () => {
  it('calls recordCreditDebit exactly once, for operationType chat', () => {
    expect(count(/recordCreditDebit\(/g)).toBe(1)
    expect(source).toMatch(/recordCreditDebit\(\{[^}]*operationType:\s*'chat'/)
  })

  it('never debits a generation/estimate op (generation debits itself)', () => {
    for (const op of ['estimate', 'photo_batch', 'audio_minutes', 'price_research']) {
      expect(source).not.toContain(`operationType: '${op}'`)
    }
    expect(source).not.toContain('grantCredits')
    expect(source).not.toContain('consumeCredits')
  })

  it('shares one per-turn attemptId between the cost event and the debit', () => {
    expect(count(/crypto\.randomUUID\(\)/g)).toBeGreaterThanOrEqual(1)
    expect(source).toMatch(/const attemptId = crypto\.randomUUID\(\)/)
    expect(source).toMatch(/recordAICost\(\{\s*attemptId,/)
    expect(source).toMatch(/recordCreditDebit\(\{[^}]*attemptId\s*\}\)/)
  })

  it('gates with assertCanCreate before resolving the model', () => {
    const gate = source.indexOf('assertCanCreate(companyId')
    const model = source.indexOf('await resolveChatModel(')
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(model)
  })
})
