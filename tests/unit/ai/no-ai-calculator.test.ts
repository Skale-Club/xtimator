import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ENG-01 static no-AI-calculator fence. The AI's only tool is create_estimate;
// it is given NO calculator tool, and its item schema exposes NO server-trusted
// computed-total numeric field. readFileSync + grep only — no DB, no key, no net.
// Complements the GUARD-03 runtime-authority test (totals-authority.test.ts):
// the server always recomputes totals; the LLM never supplies a trusted total.

const ADAPTERS = ['lib/ai/providers/anthropic.ts', 'lib/ai/providers/gemini.ts']

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

  it('the only allowedFunctionNames / tool_choice target is create_estimate', () => {
    const anthropic = readFileSync('lib/ai/providers/anthropic.ts', 'utf8')
    const gemini = readFileSync('lib/ai/providers/gemini.ts', 'utf8')
    expect(anthropic).toContain("tool_choice: { type: 'tool', name: 'create_estimate' }")
    expect(gemini).toContain("allowedFunctionNames: ['create_estimate']")
  })
})
