import { describe, it, expect } from 'vitest'

/**
 * Phase 179 Plan 01 — Task 1.
 *
 * template-composer.ts is the single pure, client-safe source of truth for
 * deriving Meta's BODY component (text + example.body_text) from ONE ordered
 * ComposerParam[] array, and for validating the pair against every Meta
 * auto-reject rule the phase's research verified (179-RESEARCH.md Pitfalls
 * 1-2). No mocks needed — pure functions, direct input/output assertions.
 */
import {
  nextVariableToken,
  validateComposerTemplate,
  buildBodyComponent,
  type ComposerParam,
} from '@/lib/whatsapp/template-composer'

function param(label: string, example: string): ComposerParam {
  return { label, example }
}

describe('nextVariableToken', () => {
  it('Test 1: empty params array returns {{1}}', () => {
    expect(nextVariableToken([])).toBe('{{1}}')
  })

  it('Test 2: two existing params returns {{3}}', () => {
    const params = [param('Client name', 'John Smith'), param('Job title', 'Kitchen remodel')]
    expect(nextVariableToken(params)).toBe('{{3}}')
  })
})

describe('validateComposerTemplate', () => {
  it('Test 3: valid case is accepted with no errors', () => {
    const params = [param('Client name', 'John Smith'), param('Job title', 'Kitchen remodel')]
    const result = validateComposerTemplate(
      'Hi {{1}}, your estimate "{{2}}" is ready.',
      params
    )
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('Test 4: empty body is rejected', () => {
    const result = validateComposerTemplate('', [])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /body.*required/i.test(e))).toBe(true)
  })

  it('Test 5: whitespace-only body is rejected', () => {
    const result = validateComposerTemplate('   ', [])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /body.*required/i.test(e))).toBe(true)
  })

  it('Test 6: body starting with a variable is rejected', () => {
    const params = [param('Client name', 'John Smith')]
    const result = validateComposerTemplate('{{1}} is ready', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /cannot start with a variable/i.test(e))).toBe(true)
  })

  it('Test 7: body ending with a variable is rejected', () => {
    const params = [param('Total', '$500')]
    const result = validateComposerTemplate('Your total is {{1}}', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /cannot end with a variable/i.test(e))).toBe(true)
  })

  it('Test 8: non-sequential (reversed) tokens are rejected', () => {
    const params = [param('A', 'a'), param('B', 'b')]
    const result = validateComposerTemplate('Hi {{2}}, {{1}}', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /sequential/i.test(e))).toBe(true)
  })

  it('Test 9: gapped tokens are rejected', () => {
    const params = [param('A', 'a'), param('B', 'b')]
    const result = validateComposerTemplate('Hi {{1}}, then {{3}}.', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /sequential/i.test(e))).toBe(true)
  })

  it('Test 10: duplicate token is rejected', () => {
    const params = [param('A', 'a')]
    const result = validateComposerTemplate('Hi {{1}} and {{1}} again.', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /sequential/i.test(e))).toBe(true)
  })

  it('Test 11: token count exceeding params.length is rejected', () => {
    const params = [param('A', 'a'), param('B', 'b')]
    const result = validateComposerTemplate('Hi {{1}}, {{2}}, and {{3}}.', params)
    expect(result.valid).toBe(false)
  })

  it('Test 12: a param with an empty example is rejected and names the position', () => {
    const params = [param('Client name', 'John Smith'), param('Job title', '')]
    const result = validateComposerTemplate('Hi {{1}}, your job "{{2}}" is ready.', params)
    expect(result.valid).toBe(false)
    expect(
      result.errors.some((e) => e.includes('{{2}}') || e.toLowerCase().includes('job title'))
    ).toBe(true)
  })

  it('Test 13: a param with a whitespace-only example is rejected', () => {
    const params = [param('Client name', '   ')]
    const result = validateComposerTemplate('Hi {{1}}.', params)
    expect(result.valid).toBe(false)
  })

  it('Test 14: a param with an empty label is rejected', () => {
    const params = [param('', 'John Smith')]
    const result = validateComposerTemplate('Hi {{1}}.', params)
    expect(result.valid).toBe(false)
  })

  it('Test 15: a param with a whitespace-only label is rejected', () => {
    const params = [param('   ', 'John Smith')]
    const result = validateComposerTemplate('Hi {{1}}.', params)
    expect(result.valid).toBe(false)
  })

  it('Test 16: body over the 1024-char limit is rejected', () => {
    const params = [param('Client name', 'John Smith')]
    const filler = 'a'.repeat(1030)
    const result = validateComposerTemplate(`Hi {{1}}, ${filler}.`, params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /1024/.test(e))).toBe(true)
  })

  it('Test 17: multiple simultaneous violations all appear in one pass', () => {
    // Starts with a variable AND the (only) param has a missing example.
    const params = [param('Client name', '')]
    const result = validateComposerTemplate('{{1}} is ready', params)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
  })

  // --- Checker INFO (ADOPTED): stray/malformed brace detection -------------
  // submitTemplateToMeta re-validates STORED body_text (a non-UI path where
  // malformed braces can arrive) — any '{{' or '}}' outside a well-formed
  // {{n}} token is an error, independent of the sequential-token check.

  it('Test 18: empty braces {{}} are rejected as malformed', () => {
    const params = [param('A', 'a')]
    const result = validateComposerTemplate('Hi {{}} there.', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /malformed|brace/i.test(e))).toBe(true)
  })

  it('Test 19: unclosed brace {{1} is rejected as malformed', () => {
    const params = [param('A', 'a')]
    const result = validateComposerTemplate('Hi {{1} there.', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /malformed|brace/i.test(e))).toBe(true)
  })

  it('Test 20: lone stray brace pair { {2}} is rejected as malformed', () => {
    const params = [param('A', 'a'), param('B', 'b')]
    const result = validateComposerTemplate('Hi { {2}} there {{1}}.', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /malformed|brace/i.test(e))).toBe(true)
  })

  it('Test 21: a stray trailing }} with no opener is rejected as malformed', () => {
    const params = [param('A', 'a')]
    const result = validateComposerTemplate('Hi {{1}} there}}.', params)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /malformed|brace/i.test(e))).toBe(true)
  })

  it('Test 22: a well-formed body has no malformed-brace error', () => {
    const params = [param('A', 'a'), param('B', 'b')]
    const result = validateComposerTemplate('Hi {{1}}, your item {{2}} is ready.', params)
    expect(result.valid).toBe(true)
    expect(result.errors.some((e) => /malformed|brace/i.test(e))).toBe(false)
  })
})

describe('buildBodyComponent', () => {
  it('Test 23: returns the exact verified Meta payload shape', () => {
    const params = [param('Client name', 'John Smith'), param('Job title', 'Kitchen remodel')]
    const result = buildBodyComponent(
      'Hi {{1}}, your estimate "{{2}}" has been updated.',
      params
    )
    expect(result).toEqual({
      type: 'BODY',
      text: 'Hi {{1}}, your estimate "{{2}}" has been updated.',
      example: { body_text: [['John Smith', 'Kitchen remodel']] },
    })
  })

  it('Test 24: trims the body text', () => {
    const params = [param('Client name', 'John Smith')]
    const result = buildBodyComponent('  Hi {{1}}.  ', params)
    expect(result.text).toBe('Hi {{1}}.')
  })

  it('Test 25: does not throw and does not validate on invalid input (pure formatter)', () => {
    // Starts with a variable, missing example — would fail validateComposerTemplate,
    // but buildBodyComponent is a pure formatter with a separate, explicit
    // responsibility (lets the composer UI show a live preview mid-edit).
    const params = [param('Client name', '')]
    expect(() => buildBodyComponent('{{1}} is ready', params)).not.toThrow()
    const result = buildBodyComponent('{{1}} is ready', params)
    expect(result).toEqual({
      type: 'BODY',
      text: '{{1}} is ready',
      example: { body_text: [['']] },
    })
  })
})
