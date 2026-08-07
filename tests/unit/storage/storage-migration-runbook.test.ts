/**
 * Phase 191 Plan 03 — MIG-04: automated gate over `docs/STORAGE-MIGRATION.md`.
 *
 * A runbook that drifts from the actual command surface is worse than no
 * runbook at all, so the required strings, the supersession banners, and the
 * "no secret-shaped literal" invariant are asserted here rather than left to
 * good intentions. `SECRET_PATTERNS` is shared, module-local, and exercised
 * by two tests against it (the doc is clean / the detector actually detects)
 * so the two assertions cannot silently drift apart from each other.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOC_PATH = resolve(process.cwd(), 'docs/STORAGE-MIGRATION.md')
const doc = readFileSync(DOC_PATH, 'utf8')

/**
 * Shared by both "the doc is clean" and "the detector actually detects".
 * A regex that never matches a real secret shape would make the first test
 * pass for the wrong reason — the second test below exists specifically to
 * catch that, per each pattern.
 */
const SECRET_PATTERNS: RegExp[] = [
  // A real R2 account id embedded in the endpoint hostname.
  /https:\/\/[0-9a-f]{20,}\.r2\.cloudflarestorage\.com/i,
  // Bare-hex tokens/keys — gitleaks has no prefix to match here, so this
  // repo's own doc gate is the only thing that can catch it.
  /\b[0-9a-f]{32,}\b/,
  // Vendor-prefixed secret shapes.
  /\b(sk|rk)_(test|live)_[A-Za-z0-9]+/,
  /\bwhsec_[A-Za-z0-9]+/,
  /\bsb_secret_[A-Za-z0-9]+/,
  /\bsk-ant-[A-Za-z0-9-]+/,
  // A Supabase storage URL paired with a JWT-shaped bearer token.
  /\.supabase\.co\/storage[\s\S]{0,200}eyJ[A-Za-z0-9_-]{20,}/,
]

describe('docs/STORAGE-MIGRATION.md — required runbook content (MIG-04)', () => {
  const requiredStrings = [
    'npm run migrate:r2',
    '-- --verify-only',
    'npm run verify:r2',
    'S3_REGION=auto',
    'S3_FORCE_PATH_STYLE=true',
    'https://<account-id>.r2.cloudflarestorage.com',
    'STORAGE_PROVIDER=supabase',
    'audio',
    'photos',
    'pdfs',
    'logos',
    'platform-brand',
  ]

  it.each(requiredStrings)('contains required string %j', (needle) => {
    expect(doc, `expected docs/STORAGE-MIGRATION.md to contain ${JSON.stringify(needle)}`).toContain(
      needle,
    )
  })

  const requiredHeadingPatterns: RegExp[] = [
    /Phase 191 — R2 migration/,
    /[Rr]ollback/,
    /Execution record/,
  ]

  it.each(requiredHeadingPatterns.map((re) => [re.source, re] as const))(
    'contains a heading/section matching /%s/',
    (_label, pattern) => {
      expect(
        pattern.test(doc),
        `expected docs/STORAGE-MIGRATION.md to contain content matching ${pattern}`,
      ).toBe(true)
    },
  )
})

describe('docs/STORAGE-MIGRATION.md — supersession banners', () => {
  it('carries at least 6 "> **Superseded**" banners (5 Hetzner steps + the old rollback)', () => {
    const matches = doc.match(/> \*\*Superseded\*\*/g) ?? []
    expect(
      matches.length,
      'a regression that deletes a superseded-banner reopens a wrong (Hetzner-era) procedure ' +
        'as if it were live — count must stay at least 6',
    ).toBeGreaterThanOrEqual(6)
  })
})

describe('docs/STORAGE-MIGRATION.md — no secret-shaped literal', () => {
  it.each(SECRET_PATTERNS.map((re) => [re.source, re] as const))(
    'finds zero matches for pattern /%s/',
    (_label, pattern) => {
      // Use a fresh global-flagged copy so `.match` collects every hit
      // regardless of whether the source pattern itself is global.
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
      const matches = doc.match(globalPattern) ?? []
      expect(
        matches,
        `found a secret-shaped literal matching ${pattern} in docs/STORAGE-MIGRATION.md: ${JSON.stringify(matches)}`,
      ).toHaveLength(0)
    },
  )
})

describe('SECRET_PATTERNS — the detector is not vacuous', () => {
  // One obviously-fake value per pattern, above. If a regex has a typo, the
  // matching entry below stops matching and this test goes red — proving
  // the "doc is clean" test above is not silently passing because the
  // detector itself is broken, the exact failure class MIG-02 exists to
  // prevent, applied to this doc gate.
  const fakeSecretSample = [
    'endpoint: https://deadbeefdeadbeefdeadbeefdeadbeef.r2.cloudflarestorage.com',
    'bare hex token: deadbeefdeadbeefdeadbeefdeadbeef00112233',
    'stripe-shaped: sk_live_deadbeefFAKEFAKEFAKEfakefake',
    'stripe-restricted-shaped: rk_test_deadbeefFAKEFAKEFAKEfakefake',
    'webhook-shaped: whsec_FAKEwebhooksecretFAKEvalueFAKE',
    'supabase-secret-shaped: sb_secret_FAKEsupabaseFAKEvalueFAKE',
    'anthropic-shaped: sk-ant-FAKEanthropicFAKEkeyFAKEvalue',
    'supabase storage url with a JWT bearer: https://example.supabase.co/storage/v1/object/sign/x?token=eyJhbGciOiJIUzI1NiJ9FAKEFAKEFAKEFAKEFAKE.fakepayloadFAKEFAKEFAKEFAKE.fakesigFAKEFAKEFAKEFAKE',
  ].join('\n')

  it.each(SECRET_PATTERNS.map((re) => [re.source, re] as const))(
    'pattern /%s/ matches its corresponding fake-secret sample',
    (_label, pattern) => {
      expect(
        pattern.test(fakeSecretSample),
        `pattern ${pattern} failed to match the fake-secret sample — the detector would be a ` +
          'no-op and report a clean doc forever',
      ).toBe(true)
    },
  )
})
