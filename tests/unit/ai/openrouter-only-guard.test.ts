import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Owner rule (non-negotiable): EVERY AI call goes through OpenRouter. No fallback
 * to direct Gemini (`@google/genai`), direct OpenAI (`api.openai.com`) or direct
 * Anthropic (`@anthropic-ai/sdk`). When OpenRouter fails the operation fails and
 * surfaces the existing error.
 *
 * Part A: static guard over lib/ and app/api/ (sibling of
 * tests/unit/billing/measure-only-invariant.test.ts).
 * Part B: runtime proof that a failing OpenRouter vision call never reaches any
 * other host and raises the existing ProvidersUnavailableError.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..')
const SCAN_ROOTS = [join(REPO_ROOT, 'lib'), join(REPO_ROOT, 'app', 'api')]

// The admin "test connection" buttons (app/admin/integrations/actions.ts) are the only
// code allowed to talk to the vendors directly; they live OUTSIDE lib/ and app/api/, so
// no allowlist entry is needed here. Add one only if a file under the scan roots must.
const ALLOWLIST: string[] = []

const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: '@google/genai', re: /@google\/genai/ },
  { label: '@anthropic-ai/sdk', re: /@anthropic-ai\/sdk/ },
  { label: 'api.openai.com', re: /api\.openai\.com/ },
  { label: 'generativelanguage.googleapis.com', re: /generativelanguage\.googleapis\.com/ },
  { label: 'api.anthropic.com', re: /api\.anthropic\.com/ },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(full)
  }
  return out
}

describe('OpenRouter-only guard (static)', () => {
  const files = SCAN_ROOTS.flatMap((r) => walk(r))

  it('scans a non-trivial set of files (sanity)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no file under lib/ or app/api/ imports a direct AI vendor SDK or references a direct vendor host', () => {
    const offenders: string[] = []
    for (const f of files) {
      const rel = relative(REPO_ROOT, f).split(sep).join('/')
      if (ALLOWLIST.includes(rel)) continue
      const src = readFileSync(f, 'utf8')
      for (const { label, re } of FORBIDDEN) {
        if (re.test(src)) offenders.push(`${rel}: ${label}`)
      }
    }
    expect(offenders, `direct-provider references found:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the removed non-OpenRouter modules stay deleted', () => {
    for (const rel of [
      'lib/ai/providers/gemini.ts',
      'lib/ai/providers/anthropic.ts',
      'lib/ai/pricing/gemini.ts',
      'lib/ai/pricing/anthropic.ts',
      'lib/estimate/price-research/adapters/anthropic-web.ts',
    ]) {
      expect(() => statSync(join(REPO_ROOT, rel)), rel).toThrow()
    }
  })

  it('no source file imports a gemini/anthropic provider module', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (/from ['"][^'"]*(providers|pricing|adapters)\/(gemini|anthropic|anthropic-web)['"]/.test(src)) {
        offenders.push(relative(REPO_ROOT, f))
      }
    }
    expect(offenders).toEqual([])
  })
})

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(async (provider: string) =>
    provider === 'openrouter' ? 'or-key-placeholder' : 'other-key-placeholder'
  ),
}))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: {
    generation: () => ({ end: () => {} }),
    flushAsync: async () => {},
  },
}))
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: vi.fn(async () => {}),
}))

import { analyzePhotoOR } from '@/lib/ai/openrouter-client'
import { ProvidersUnavailableError } from '@/lib/ai/with-fallback'

describe('photo analysis failure never reaches another provider (runtime)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'upstream down',
    })) as unknown as typeof fetch
  })

  it('OpenRouter vision failure -> ProvidersUnavailableError; every request targeted openrouter.ai', async () => {
    await expect(analyzePhotoOR('aGVsbG8=', 'image/jpeg')).rejects.toBeInstanceOf(
      ProvidersUnavailableError
    )
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.startsWith('https://openrouter.ai/'))).toBe(true)
  })
})
