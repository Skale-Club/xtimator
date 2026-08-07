// @vitest-environment node
//
// Phase 190 Plan 02 — URL-01: repo-wide STATIC gate on the form of persisted
// asset URLs. Files are read off disk and scanned as text (the same technique as
// tests/unit/demo/mutation-boundary-sweep.test.ts) — nothing here is executed, so
// the gate holds even for modules that cannot be imported under Vitest.
//
// B2 — the scan matches the CALL shape `.getPublicUrl(`, NOT the bare identifier
// `getPublicUrl`. A bare-identifier scan is RED on a clean tree, because these
// are mentions and declarations rather than calls:
//   app/storage/[bucket]/[...key]/route.ts  — the word appears in a docblock
//   lib/storage/index.ts                    — `getPublicUrl(bucket, path): string` interface member
//   lib/storage/s3-provider.ts              — docblock + method declaration
//   lib/storage/supabase-provider.ts        — method declaration
//   lib/storage/browser-upload.ts           — object-literal method declaration
//   lib/schemas/admin.ts                    — the word appears in a comment
// Only the CALL shape distinguishes "someone is minting a backend URL" from
// "the storage seam declares the method".
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERSISTABLE_PROXY_BUCKETS } from '@/lib/storage/asset-url'

const ROOT = resolve(__dirname, '../../..')
const SCANNED_DIRS = ['app', 'lib', 'components']

/**
 * The provider's own internal `client.storage.from(bucket).getPublicUrl(path)`.
 * Required: `StorageProvider` keeps `getPublicUrl` on its contract and
 * `lib/storage/s3-provider.ts` must not be edited by this plan.
 */
const PROVIDER_INTERNAL = 'lib/storage/supabase-provider.ts'

/**
 * B1 — the DELIBERATE hero-background-video exemption. This is NOT a whole-file
 * pass: the assertions below additionally require that the file holds EXACTLY ONE
 * `.getPublicUrl(` call and that it is the one assigning `newBgVideoUrl`.
 *
 * Why it exists: the Phase 187 asset proxy is whole-object pass-through with no
 * Range/206 and no `Accept-Ranges`, and Safari (desktop + iOS) refuses to play a
 * `<video>` from an origin that does not honour byte-range requests. The asset can
 * be up to 20MB with no transcoding and renders as a bare `<video>` in
 * components/landing/hero-section.tsx.
 *
 * PREREQUISITE before repointing it: the asset proxy must support Range/206.
 */
const VIDEO_EXEMPTION_FILE = 'app/admin/landing/actions.ts'
const VIDEO_EXEMPTION_VARIABLE = 'newBgVideoUrl'

type Hit = { file: string; line: number; text: string }

function repoPath(absolutePath: string): string {
  return relative(ROOT, absolutePath).replaceAll('\\', '/')
}

function sourceFiles(): string[] {
  return SCANNED_DIRS.flatMap((dir) =>
    readdirSync(resolve(ROOT, dir), { recursive: true, withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')),
      )
      .map((entry) => resolve(entry.parentPath, entry.name)),
  ).sort()
}

/** Every source line, tagged with its repo-relative path and 1-based line number. */
function scan(predicate: (line: string) => boolean): Hit[] {
  const hits: Hit[] = []
  for (const absolute of sourceFiles()) {
    const file = repoPath(absolute)
    const lines = readFileSync(absolute, 'utf8').split(/\r?\n/)
    lines.forEach((text, index) => {
      if (predicate(text)) hits.push({ file, line: index + 1, text: text.trim() })
    })
  }
  return hits
}

function format(hits: Hit[]): string[] {
  return hits.map((hit) => `${hit.file}:${hit.line}  ${hit.text}`)
}

/** A comment line — a doc mention is not a call. */
function isCommentLine(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

describe('Phase 190 (URL-01) — persisted asset URLs are same-origin paths', () => {
  it('confines every `.getPublicUrl(` CALL to the provider internal + the B1 video exemption', () => {
    const hits = scan((text) => !isCommentLine(text) && /\.getPublicUrl\(/.test(text))

    const offenders = hits.filter(
      (hit) => hit.file !== PROVIDER_INTERNAL && hit.file !== VIDEO_EXEMPTION_FILE,
    )

    expect(
      format(offenders),
      'These sites mint a storage-backend URL and would bake a hostname into a DB row. ' +
        'Use storageProxyPath(bucket, key) from @/lib/storage/asset-url instead.',
    ).toEqual([])

    // The provider internal must still be there — if it vanished, the allowlist is
    // stale and this gate has quietly stopped testing anything.
    expect(
      hits.filter((hit) => hit.file === PROVIDER_INTERNAL).length,
      `${PROVIDER_INTERNAL} no longer calls getPublicUrl — remove it from the allowlist.`,
    ).toBe(1)
  })

  it('keeps the B1 exemption NARROW: exactly one call, bound to the background-video variable', () => {
    const hits = scan(
      (text) => !isCommentLine(text) && /\.getPublicUrl\(/.test(text),
    ).filter((hit) => hit.file === VIDEO_EXEMPTION_FILE)

    expect(
      format(hits),
      `${VIDEO_EXEMPTION_FILE} is allowlisted for the hero-background-VIDEO only. ` +
        'Exactly one .getPublicUrl( call may live here.',
    ).toHaveLength(1)

    expect(
      hits[0]?.text,
      'The one allowed .getPublicUrl( call in this file must be the ' +
        `${VIDEO_EXEMPTION_VARIABLE} assignment (B1). Any other asset in this file ` +
        'must go through storageProxyPath().',
    ).toMatch(new RegExp(`${VIDEO_EXEMPTION_VARIABLE}\\s*=`))
  })

  it('calls storageProxyPath() with a LITERAL bucket from PERSISTABLE_PROXY_BUCKETS', () => {
    const allowed = new Set<string>(PERSISTABLE_PROXY_BUCKETS)
    const bad: Hit[] = []

    for (const absolute of sourceFiles()) {
      const file = repoPath(absolute)
      const lines = readFileSync(absolute, 'utf8').split(/\r?\n/)
      lines.forEach((text, index) => {
        if (isCommentLine(text)) return
        for (const match of text.matchAll(/storageProxyPath\(/g)) {
          const start = match.index ?? 0
          // The declaration itself is not a call site.
          if (/function\s+$/.test(text.slice(0, start))) continue
          const rest = text.slice(start + match[0].length)
          const literal = /^\s*(['"])([^'"]*)\1\s*,/.exec(rest)
          if (!literal || !allowed.has(literal[2])) {
            bad.push({ file, line: index + 1, text: text.trim() })
          }
        }
      })
    }

    expect(
      format(bad),
      'storageProxyPath() must be called with a literal bucket from ' +
        `PERSISTABLE_PROXY_BUCKETS (${PERSISTABLE_PROXY_BUCKETS.join(', ')}). ` +
        'A variable bucket defeats the "no persisted URL for a bucket with no ' +
        'defined viewer" invariant statically.',
    ).toEqual([])
  })

  it('hard-codes no Supabase public-object URL prefix in app/, lib/ or components/', () => {
    // tests/ fixtures are exempt on purpose: rows written before this plan
    // legitimately hold absolute Supabase URLs and must keep being asserted.
    const hits = scan((text) => text.includes('supabase.co/storage/v1/object/public'))

    expect(
      format(hits),
      'A hard-coded Supabase public-object URL is a backend hostname baked into ' +
        'source. Build the path with storageProxyPath() instead.',
    ).toEqual([])
  })
})
