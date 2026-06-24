import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * KMOD-03 + KSEC-01 — the knowledge-prompt hardened boundary.
 *
 * Retrieved knowledge is curated but NOT trusted as LLM context: every passage
 * title/body enters the prompt ONLY through buildKnowledgePrompt, run through the
 * existing sanitizeField (escaping `<` to `&lt;` etc.) and wrapped in a <knowledge>
 * tag; the question is likewise sanitizeField-escaped into the user message. The
 * prompt-builder's ## Security block must enumerate the <knowledge> tag.
 *
 * This is the GREEN gate Plan 03 must satisfy — do NOT delete or weaken it.
 */

import { buildKnowledgePrompt } from '@/lib/knowledge/prompt'
import type { Passage } from '@/lib/knowledge/provider'

const ROOT = process.cwd()
const PROMPT_BUILDER = resolve(ROOT, 'lib/ai/prompt-builder.ts')
const KNOWLEDGE_PROMPT = resolve(ROOT, 'lib/knowledge/prompt.ts')

function passage(body: string, title = 'T'): Passage {
  return { id: 'p1', title, body, source: null, scope: 'industry', similarity: 0.9 }
}

describe('KMOD-03 + KSEC-01: knowledge prompt hardening', () => {
  it('Test 1: wraps each passage in <knowledge> and routes the body through sanitizeField', () => {
    const { system } = buildKnowledgePrompt(
      [passage('<script>alert(1)</script>')],
      'how do I pre-treat a pet stain?'
    )
    // The raw `<` must be escaped to &lt; — proof the passage routed through sanitizeField.
    expect(system).toContain('&lt;script&gt;')
    expect(system).not.toContain('<script>')
    // …inside a <knowledge> wrapper.
    expect(system).toMatch(/<knowledge>[\s\S]*&lt;script&gt;[\s\S]*<\/knowledge>/)
  })

  it('Test 2: the question is sanitizeField-escaped into the returned user message', () => {
    const { user } = buildKnowledgePrompt([passage('blot the area')], '<b>inject</b>')
    expect(user).toContain('&lt;b&gt;inject&lt;/b&gt;')
    expect(user).not.toContain('<b>')
  })

  it('Test 3 (static): the prompt-builder ## Security block enumerates the <knowledge> tag', () => {
    expect(existsSync(PROMPT_BUILDER)).toBe(true)
    const src = readFileSync(PROMPT_BUILDER, 'utf8')
    const securityIdx = src.indexOf('## Security')
    expect(securityIdx).toBeGreaterThan(-1)
    expect(src.slice(securityIdx)).toMatch(/<knowledge>/)
  })

  it('Test 4 (static): lib/knowledge/prompt.ts imports sanitizeField from the shared boundary', () => {
    expect(existsSync(KNOWLEDGE_PROMPT)).toBe(true)
    const src = readFileSync(KNOWLEDGE_PROMPT, 'utf8')
    expect(src).toMatch(/import \{ sanitizeField \} from '@\/lib\/ai\/prompt-builder'/)
    // No bespoke parallel escaper — the hardened boundary is the SINGLE path.
    expect(src).not.toMatch(/replace\(\/&\/g/)
    expect(src).not.toMatch(/replace\(\/</)
  })
})
