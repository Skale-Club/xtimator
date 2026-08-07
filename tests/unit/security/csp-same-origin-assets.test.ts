import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 190 Plan 04 — URL-04: the Content-Security-Policy covers the same-origin
 * asset source and NOTHING more.
 *
 * The audit's conclusion is that `img-src` already contained `'self'`, which is
 * exactly what permits `/storage/{bucket}/{key}` (the Phase 187 proxy route), so
 * Phase 190's code change to the policy is ZERO. What this file adds is a PIN:
 * the host lists are asserted exactly, so the Phase 192 narrowing cannot happen
 * by accident and a careless CSP edit cannot silently widen the policy.
 *
 * STATIC SOURCE READ, deliberately — `next.config.ts` cannot be imported into
 * vitest because it pulls in `@sentry/nextjs`. Same technique as
 * tests/unit/demo/mutation-boundary-sweep.test.ts.
 *
 * IMPORTANT WORDING NOTE for whoever edits this file: the `media-src` assertion
 * below is a CHANGE-DETECTOR ONLY. It must never be re-worded to claim that
 * `media-src 'self'` "covers" a proxied video. No video is served from
 * `/storage/` — Plan 02's B1 exemption keeps `hero-bg-videos/` on Supabase
 * because the proxy has no Range/206 and Safari will not play a `<video>`
 * without it, which is why `https://*.supabase.co` must STAY in `media-src`.
 * CSP permission is not playback capability, and an assertion phrased as
 * coverage would certify a break.
 */

const CONFIG_PATH = resolve(process.cwd(), 'next.config.ts')

function readConfig(): string {
  expect(existsSync(CONFIG_PATH), `${CONFIG_PATH} must exist`).toBe(true)
  return readFileSync(CONFIG_PATH, 'utf8')
}

/**
 * Extracts the `cspReportOnly` array's string-literal entries and parses each
 * into `{ directive, sources[] }`. Comment lines inside the array are skipped
 * (they are not string literals), so the rationale block cannot perturb the
 * parse.
 */
function parseCspDirectives(source: string): Map<string, string[]> {
  const start = source.indexOf('const cspReportOnly = [')
  expect(start, 'next.config.ts must declare `const cspReportOnly = [`').toBeGreaterThan(-1)
  const end = source.indexOf('].join(', start)
  expect(end, 'the cspReportOnly array must be closed with `].join(`').toBeGreaterThan(start)

  const block = source.slice(start, end)
  const entries = [...block.matchAll(/^\s*"([^"]+)",?\s*$/gm)].map((m) => m[1])
  expect(entries.length, 'no CSP directive string literals were parsed').toBeGreaterThan(5)

  const map = new Map<string, string[]>()
  for (const entry of entries) {
    const tokens = entry.trim().split(/\s+/)
    const directive = tokens[0]
    map.set(directive, tokens.slice(1))
  }
  return map
}

describe('Phase 190 URL-04 — CSP and the same-origin asset proxy', () => {
  it("img-src contains 'self', which is what permits /storage/{bucket}/{key}", () => {
    const directives = parseCspDirectives(readConfig())
    const imgSrc = directives.get('img-src')

    expect(imgSrc, 'img-src directive missing from the CSP').toBeDefined()
    expect(imgSrc).toContain("'self'")
  })

  it('img-src gained NO host in Phase 190 — the host list is pinned exactly', () => {
    const directives = parseCspDirectives(readConfig())
    const imgSrc = directives.get('img-src')!
    const hosts = imgSrc.filter((s) => s.startsWith('http'))

    // Fails if a host is ADDED (Phase 190 must broaden nothing) or REMOVED
    // (the Phase 192 narrowing has to come with a deliberate edit to this test,
    // after URL-02 rewrites the existing absolute rows).
    expect(hosts).toEqual([
      'https://*.supabase.co',
      'https://*.supabase.in',
      'https://*.googleusercontent.com',
    ])

    // No `https://xtimator.com` (or any same-origin host spelled out) — that
    // would be strictly broader than `'self'`.
    expect(imgSrc.join(' ')).not.toMatch(/xtimator\.com/)
  })

  it('img-src keeps its non-host sources (data:, blob:) unchanged', () => {
    const directives = parseCspDirectives(readConfig())
    expect(directives.get('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://*.supabase.co',
      'https://*.supabase.in',
      'https://*.googleusercontent.com',
    ])
  })

  it('media-src is UNCHANGED (change-detector only — not a claim about video playback)', () => {
    const directives = parseCspDirectives(readConfig())
    const mediaSrc = directives.get('media-src')

    expect(mediaSrc, 'media-src directive missing from the CSP').toBeDefined()
    expect(mediaSrc).toEqual(["'self'", 'blob:', 'https://*.supabase.co'])

    // The Supabase entry is load-bearing for the hero background VIDEO, which is
    // deliberately still served from Supabase (Plan 02 exemption B1). Its removal
    // is a break, not a cleanup — hence the explicit assertion above.
    expect(mediaSrc).toContain('https://*.supabase.co')
  })

  it("default-src is 'self' and frame-ancestors is 'none' (unchanged guards)", () => {
    const directives = parseCspDirectives(readConfig())
    expect(directives.get('default-src')).toEqual(["'self'"])
    expect(directives.get('frame-ancestors')).toEqual(["'none'"])
  })

  it('the Phase 190 audit rationale is recorded at the code site, not only in a plan', () => {
    const source = readConfig()
    // A stale or deleted justification is how Phase 192 would drop the media-src
    // entry by mistake. Pin the two facts that are not deducible from the policy.
    expect(source).toMatch(/Phase 190 \(URL-04\) CSP audit/)
    expect(source).toMatch(/Range\/206/)
  })

  it('images.remotePatterns still allows the legacy *.supabase.co public objects', () => {
    const source = readConfig()
    // Until Phase 192 rewrites existing rows, absolute Supabase URLs still reach
    // next/image on the surfaces that do use the optimizer.
    expect(source).toMatch(/hostname:\s*'\*\.supabase\.co'/)
    expect(source).toMatch(/pathname:\s*'\/storage\/v1\/object\/public\/\*\*'/)
  })
})
