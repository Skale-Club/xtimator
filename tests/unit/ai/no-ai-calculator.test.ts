import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ENG-01 static no-AI-calculator fence. The AI's only tool is create_estimate;
// it is given NO calculator tool, and its item schema exposes NO server-trusted
// computed-total numeric field. readFileSync + grep only — no DB, no key, no net.
// Complements the GUARD-03 runtime-authority test (totals-authority.test.ts):
// the server always recomputes totals; the LLM never supplies a trusted total.

const ADAPTERS = ['lib/ai/providers/openrouter.ts']

// Computed-total / tax fields the AI item schema must never declare as a
// server-trusted numeric property.
const FORBIDDEN = ['total', 'tax', 'tax_amount', 'subtotal', 'grand_total', 'grandTotal']

describe('ENG-01: AI has no calculator tool and no server-trusted computed-total field', () => {
  for (const adapter of ADAPTERS) {
    it(`${adapter}: only create_estimate tool, no calculator`, () => {
      const src = readFileSync(adapter, 'utf8')
      expect(src).toContain("name: 'create_estimate'")
      // no calculator tool
      expect(src).not.toMatch(/name:\s*['"]calculat/i)
      // the AI item schema must not declare a server-trusted computed-total numeric property
      for (const f of FORBIDDEN) {
        expect(src).not.toMatch(
          new RegExp(`\\b${f}:\\s*\\{\\s*type:\\s*(Type\\.NUMBER|['"]number)`, 'i'),
        )
      }
    })
  }

  it('the only tool_choice target is create_estimate', () => {
    const openrouter = readFileSync('lib/ai/providers/openrouter.ts', 'utf8')
    expect(openrouter).toMatch(/tool_choice:\s*\{\s*type:\s*'function',\s*function:\s*\{\s*name:\s*'create_estimate'/)
  })
})
