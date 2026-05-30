import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { whatsAppProcessJob } from '@/lib/inngest/functions/whatsapp-process'

/**
 * INNGEST-07: whatsAppProcessJob (Wave 1 GREEN).
 *
 * Plan 67-02 delivers lib/inngest/functions/whatsapp-process.ts. Contract:
 *   - createFunction id = 'whatsapp-process'
 *   - idempotency CEL = 'event.data.batchKey' (deduped across debounced batches)
 *   - At least 3 step.run blocks: per-message processing + generate-estimate + confirm
 */

type FnInternals = {
  opts: {
    id: string
    idempotency?: string
    retries?: number
  }
}

describe('INNGEST-07: whatsAppProcessJob', () => {
  it('is created with id "whatsapp-process" and idempotency: "event.data.batchKey"', () => {
    const fn = whatsAppProcessJob as unknown as FnInternals
    expect(fn.opts.id).toBe('whatsapp-process')
    expect(fn.opts.idempotency).toBe('event.data.batchKey')
  })

  it('function body has at least 3 step.run blocks: per-message processing + generate-estimate + confirm', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/whatsapp-process.ts'),
      'utf8'
    )
    const stepRunCount = (src.match(/step\.run\(/g) ?? []).length
    expect(stepRunCount).toBeGreaterThanOrEqual(3)
    // Specific named steps required by the contract
    expect(src).toMatch(/step\.run\(`process-\$\{[^}]+\}`/)
    expect(src).toMatch(/step\.run\(['"]generate-estimate['"]/)
    expect(src).toMatch(/generateEstimateForProject\s*\(/)
  })

  // Quick task 260529-lc0: vague inbound → ask for more details instead of $0 estimate.
  it('has a vagueness branch that asks for details instead of awaiting_confirm', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/whatsapp-process.ts'),
      'utf8'
    )
    // Opens an awaiting_details session (not awaiting_confirm) when vague
    expect(src).toMatch(/awaiting_details/)
    // Uses the ask-details helpers
    expect(src).toMatch(/isVagueEstimate\(/)
    expect(src).toMatch(/buildAskDetailsMessage\(/)
    expect(src).toMatch(/revertVagueEstimate\(/)
    // Dedicated steps for evaluating vagueness and asking for details
    expect(src).toMatch(/step\.run\(['"]evaluate-vagueness['"]/)
    expect(src).toMatch(/step\.run\(['"]ask-details['"]/)
  })
})
