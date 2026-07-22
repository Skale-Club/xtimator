import { describe, it, expect } from 'vitest'
import {
  renderTemplate,
  escapeHtmlValue,
  escapeTextValue,
  sanitizeWhatsAppParam,
  extractVariables,
} from '@/lib/notifications/template-engine'

/**
 * Phase 172 (TMPL-07) — the shared `{{var}}` interpolator + per-channel escaping
 * module every later template-consuming plan in this milestone imports.
 *
 * All five exports under test here are pure functions — no mocks needed.
 */

describe('renderTemplate', () => {
  it('substitutes a single var', () => {
    expect(renderTemplate('Hi {{name}}', { name: 'Bob' }, 'text')).toBe('Hi Bob')
  })

  it('substitutes multiple distinct vars in one pass', () => {
    expect(
      renderTemplate(
        'Hi {{name}}, your {{estimateNumber}} is ready.',
        { name: 'Bob', estimateNumber: 'EST-42' },
        'text',
      ),
    ).toBe('Hi Bob, your EST-42 is ready.')
  })

  it('substitutes a missing var (referenced, absent from vars) as empty string', () => {
    expect(renderTemplate('Hi {{name}}', {}, 'text')).toBe('Hi ')
  })

  it('substitutes a null var as empty string, not the literal "null"', () => {
    expect(renderTemplate('Hi {{name}}', { name: null }, 'text')).toBe('Hi ')
  })

  it('substitutes an undefined var as empty string, not the literal "undefined"', () => {
    expect(renderTemplate('Hi {{name}}', { name: undefined }, 'text')).toBe('Hi ')
  })

  it('silently ignores an extra var present in vars but never referenced in the template', () => {
    expect(renderTemplate('Hi {{name}}', { name: 'Bob', unused: 'x' }, 'text')).toBe('Hi Bob')
  })

  it('coerces a numeric var to its string form before escaping', () => {
    expect(renderTemplate('{{quotaPercent}}%', { quotaPercent: 80 }, 'text')).toBe('80%')
  })

  it('resolves nested/malformed braces to the documented innermost-match behavior', () => {
    // \w+ can only match the innermost complete {{name}} — the leftover outer
    // braces pass through as literal text (no code execution risk).
    expect(renderTemplate('{{{{name}}}}', { name: 'X' }, 'text')).toBe('{{X}}')
  })

  it('html channel: escapes <script> so no raw < or > survive', () => {
    const out = renderTemplate('{{value}}', { value: '<script>alert(1)</script>' }, 'html')
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
  })

  it('html channel: escapes &, ", \' to their entities', () => {
    const out = renderTemplate('{{value}}', { value: `& " '` }, 'html')
    expect(out).toBe('&amp; &quot; &#39;')
  })

  it('text channel: the same &, <, > value renders UNCHANGED (no HTML entities)', () => {
    const out = renderTemplate('{{value}}', { value: '& < >' }, 'text')
    expect(out).toBe('& < >')
  })

  it('text channel: \\n/\\r/\\t are stripped/collapsed, not left as literal newlines', () => {
    const out = renderTemplate('{{value}}', { value: 'Line1\nLine2\r\tEnd' }, 'text')
    expect(out).not.toMatch(/[\n\r\t]/)
  })
})

describe('escapeHtmlValue', () => {
  it('escapes & < > " \' — mirrors notification-emails.ts escapeHtml()', () => {
    expect(escapeHtmlValue('&')).toBe('&amp;')
    expect(escapeHtmlValue('<')).toBe('&lt;')
    expect(escapeHtmlValue('>')).toBe('&gt;')
    expect(escapeHtmlValue('"')).toBe('&quot;')
    expect(escapeHtmlValue("'")).toBe('&#39;')
  })

  it('escapes a full injection payload with no raw markup surviving', () => {
    const out = escapeHtmlValue('<img src=x onerror="alert(1)">')
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtmlValue('Acme Co')).toBe('Acme Co')
  })
})

describe('escapeTextValue', () => {
  it('strips control chars including \\r\\n\\t', () => {
    expect(escapeTextValue('a\r\nb\tc')).not.toMatch(/[\r\n\t]/)
  })

  it('collapses runs of 2+ spaces to one', () => {
    expect(escapeTextValue('a    b')).toBe('a b')
  })

  it('trims leading/trailing whitespace', () => {
    expect(escapeTextValue('  padded  ')).toBe('padded')
  })
})

describe('sanitizeWhatsAppParam', () => {
  it('strips embedded newlines/tabs', () => {
    expect(sanitizeWhatsAppParam('Line1\nLine2')).toBe('Line1 Line2')
  })

  it('collapses 4+ consecutive spaces down to 3 (Meta reject threshold), not fully to 1', () => {
    const out = sanitizeWhatsAppParam('a    b')
    expect(out).toBe('a   b')
    expect(out).not.toMatch(/ {4,}/)
  })

  it('trims leading/trailing whitespace', () => {
    expect(sanitizeWhatsAppParam('  padded  ')).toBe('padded')
  })

  it('is a no-op on an already-clean value', () => {
    expect(sanitizeWhatsAppParam('Acme Co')).toBe('Acme Co')
    expect(sanitizeWhatsAppParam('$1,200')).toBe('$1,200')
  })
})

describe('extractVariables', () => {
  it('returns unique var names in first-appearance order, no duplicates', () => {
    expect(
      extractVariables(
        'Hi {{name}}, your {{estimateNumber}} is ready. {{name}} thanks you.',
      ),
    ).toEqual(['name', 'estimateNumber'])
  })

  it('returns an empty array (not undefined) for a template with no tokens', () => {
    expect(extractVariables('Hi there, no vars here.')).toEqual([])
  })
})
