/**
 * Phase 187 Plan 02 — MIG-03: R2 provisioning verification script.
 *
 * The five R2 buckets and the scoped Account API token were provisioned by
 * hand on 2026-08-06 (see docs/STORAGE-MIGRATION.md and
 * .planning/phases/187-r2-provisioning-same-origin-asset-proxy/CONTEXT.md).
 * This script does NOT create, rename, or delete anything — it only
 * asserts that what was provisioned is still true, so MIG-03 stays
 * demonstrable on demand instead of a remembered fact.
 *
 * Checks, in order:
 *   1. verifyBuckets   — HeadBucket on all five buckets: reachable + readable
 *                        by the credential.
 *   2. verifyScope     — HeadBucket on a bucket OUTSIDE the five (default
 *                        'xtimator', the deleted smoke bucket). A DENIAL is
 *                        the pass condition — a credential that can reach it
 *                        is broader than intended, and that is reported FAIL.
 *   3. verifyRoundTrip — for each of the five buckets: upload -> signed URL
 *                        -> download -> delete (same sequence as
 *                        scripts/storage-smoke.ts), via the unmodified
 *                        createS3StorageProvider from lib/storage/s3-provider.ts.
 *   4. verifyPublicAccessDisabled — Cloudflare management-API check that
 *                        r2.dev public access is OFF, per bucket. Only runs
 *                        when CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 *                        are BOTH set inline; otherwise the result is
 *                        SKIPPED, never a silent PASS. This cannot be
 *                        checked from the S3 side: a bucket with public
 *                        access enabled gets an unguessable
 *                        pub-<hash>.r2.dev hostname assigned by Cloudflare,
 *                        so the absence of public access is not observable
 *                        through the S3 API — only the Cloudflare
 *                        "managed domain" resource exposes that state.
 *
 * Config comes exclusively from `s3ConfigFromEnv()` (lib/storage/s3-config.ts)
 * — this file does not re-implement or re-read the S3_* -> config mapping.
 *
 * Usage — env vars inline, never written to `.env.local` (the same house
 * convention `scripts/storage-smoke.ts`'s own docblock states verbatim).
 * See docs/STORAGE-MIGRATION.md ("MIG-03 — provisioning record and
 * re-verification") for the full copy-pasteable runbook with placeholders.
 * Omitting the two Cloudflare vars downgrades check 4 to SKIPPED.
 *
 *   npm run verify:r2
 */
import { pathToFileURL } from 'node:url'
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'
import { s3ConfigFromEnv } from '@/lib/storage/s3-config'
import { createS3StorageProvider } from '@/lib/storage/s3-provider'
import type { S3ProviderConfig } from '@/lib/storage/s3-provider'

export const EXPECTED_BUCKETS = ['audio', 'photos', 'pdfs', 'logos', 'platform-brand'] as const

export interface CheckResult {
  name: string
  ok: boolean
  detail: string
  /** true only for the public-access check when the Cloudflare vars are absent. */
  skipped?: boolean
}

/**
 * HeadBucket against every expected bucket. A 200 means the bucket exists
 * and the credential can reach it. Each entry's `detail` captures the SDK
 * error `name` on failure, never a bare boolean.
 */
export async function verifyBuckets(
  client: S3Client,
  buckets: readonly string[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const bucket of buckets) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
      results.push({ name: `bucket:${bucket}`, ok: true, detail: 'reachable' })
    } catch (err) {
      results.push({ name: `bucket:${bucket}`, ok: false, detail: errorName(err) })
    }
  }
  return results
}

/**
 * The inversion is the whole point of this check: HeadBucket succeeding
 * against a bucket outside the allowlist means the credential is BROADER
 * than the five buckets it should be scoped to — that is the failure. A
 * denial (AccessDenied/NotFound/etc.) is the correct, passing outcome.
 */
export async function verifyScope(
  client: S3Client,
  forbiddenBucket: string,
): Promise<CheckResult> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: forbiddenBucket }))
    return {
      name: `scope:${forbiddenBucket}`,
      ok: false,
      detail: 'token reaches a bucket outside the allowlist',
    }
  } catch (err) {
    return {
      name: `scope:${forbiddenBucket}`,
      ok: true,
      detail: `correctly denied (${errorName(err)})`,
    }
  }
}

/**
 * Same upload -> signed URL -> download -> delete sequence as
 * scripts/storage-smoke.ts, run through the untouched createS3StorageProvider.
 * Delete always runs (`finally`), even when an earlier assertion in this
 * function fails, so a failed run doesn't leave verify/* litter behind.
 */
export async function verifyRoundTrip(
  bucket: string,
  config: S3ProviderConfig,
): Promise<CheckResult> {
  const storage = createS3StorageProvider(config)
  const key = `verify/${Date.now()}-r2-verify.txt`
  const payload = `r2-verify roundtrip at ${new Date().toISOString()}`

  try {
    await storage.upload(bucket, key, Buffer.from(payload), { contentType: 'text/plain' })
    await storage.getSignedUrl(bucket, key, 60)
    const blob = await storage.download(bucket, key)
    const text = await blob.text()
    if (text !== payload) {
      return {
        name: `roundtrip:${bucket}`,
        ok: false,
        detail: 'downloaded content did not match uploaded content',
      }
    }
    return { name: `roundtrip:${bucket}`, ok: true, detail: 'upload/sign/download OK' }
  } catch (err) {
    return {
      name: `roundtrip:${bucket}`,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    }
  } finally {
    try {
      await storage.delete(bucket, key)
    } catch {
      // Best-effort cleanup only — a delete failure must not mask the
      // primary result computed above.
    }
  }
}

export async function verifyPublicAccessDisabled(bucket: string): Promise<CheckResult> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN

  if (!accountId || !apiToken) {
    return {
      name: `public-access:${bucket}`,
      ok: true,
      skipped: true,
      detail:
        'set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID inline to assert public access is disabled',
    }
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/domains/managed`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    )
    if (!res.ok) {
      return {
        name: `public-access:${bucket}`,
        ok: false,
        detail: `Cloudflare API returned ${res.status}`,
      }
    }
    const body = await res.json().catch(() => null)
    const enabled = (body as { result?: { enabled?: unknown } } | null)?.result?.enabled
    if (enabled !== false) {
      return {
        name: `public-access:${bucket}`,
        ok: false,
        detail: `expected managed-domain enabled=false, got ${JSON.stringify(enabled)}`,
      }
    }
    return { name: `public-access:${bucket}`, ok: true, detail: 'public r2.dev access disabled' }
  } catch (err) {
    return {
      name: `public-access:${bucket}`,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * A SKIPPED entry never counts as a failure (`allPassed` stays true when it
 * is the only non-PASS entry) but must render distinctly from PASS so an
 * operator reading the report can tell "verified" apart from "not checked".
 */
export function formatReport(results: CheckResult[]): { text: string; allPassed: boolean } {
  const lines = results.map((r) => {
    const label = r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'
    return `[${label}] ${r.name} — ${r.detail}`
  })
  const allPassed = results.every((r) => r.ok)
  const summary = allPassed ? 'ALL CHECKS PASSED (SKIP allowed, FAIL none)' : 'ONE OR MORE CHECKS FAILED'
  return { text: [...lines, '', summary].join('\n'), allPassed }
}

export async function main(): Promise<void> {
  const config = s3ConfigFromEnv()
  if (!config) {
    console.error(
      '[r2-verify] R2 not configured — one or more required S3_* env vars are missing or ' +
        'empty (see lib/storage/s3-config.ts for the exact list). Set them inline and re-run.',
    )
    process.exit(1)
    return
  }

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? true,
  })

  const forbiddenBucket = process.argv[2] ?? 'xtimator'

  const results: CheckResult[] = []
  results.push(...(await verifyBuckets(client, EXPECTED_BUCKETS)))
  results.push(await verifyScope(client, forbiddenBucket))
  for (const bucket of EXPECTED_BUCKETS) {
    results.push(await verifyRoundTrip(bucket, config))
  }
  for (const bucket of EXPECTED_BUCKETS) {
    results.push(await verifyPublicAccessDisabled(bucket))
  }

  const { text, allPassed } = formatReport(results)
  console.log(text)
  process.exit(allPassed ? 0 : 1)
}

function errorName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    return String((err as { name: unknown }).name)
  }
  return 'UnknownError'
}

// Guard direct execution so tests can import every export above with zero
// S3 calls and zero process.exit side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
