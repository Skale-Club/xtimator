/**
 * Phase 66 Plan 03 — STORAGE-07: storage smoke test.
 *
 * Exercises the four core operations against the configured provider:
 *   1. upload          — write a small text payload
 *   2. getSignedUrl    — produce a 60-second URL
 *   3. download        — fetch via storage.download AND via the signed URL
 *   4. delete          — clean up
 *
 * Usage:
 *
 *   # Against Supabase (default — uses your dev Supabase service role)
 *   npx tsx scripts/storage-smoke.ts
 *
 *   # Against local MinIO:
 *   docker run -d -p 9000:9000 -p 9001:9001 \
 *     -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
 *     --name xtimator-minio-smoke \
 *     minio/minio server /data --console-address ":9001"
 *
 *   # Then in MinIO console (http://localhost:9001) create a bucket
 *   # called 'smoketest' and run (env vars inline — never write to .env.local).
 *   # Phase 188: S3_* presence ALONE selects the S3/R2 backend —
 *   # STORAGE_PROVIDER=s3 is optional and only needed to make an incomplete
 *   # S3_* config fail loudly instead of silently falling back to Supabase:
 *
 *     S3_ENDPOINT=http://localhost:9000 \
 *     S3_REGION=us-east-1 \
 *     S3_ACCESS_KEY_ID=minioadmin \
 *     S3_SECRET_ACCESS_KEY=minioadmin \
 *     S3_FORCE_PATH_STYLE=true \
 *     npx tsx scripts/storage-smoke.ts smoketest
 *
 *   # Tear down MinIO afterwards:
 *   docker rm -f xtimator-minio-smoke
 *
 * After running, confirm Supabase is restored as default (no S3_* vars left
 * in your committed .env.local).
 */
import 'dotenv/config'
import { getServerStorage, serverStorageBackend } from '@/lib/storage/server'

const BUCKET = process.argv[2] ?? 'pdfs'
const KEY = `smoke/${Date.now()}-roundtrip.txt`
const PAYLOAD = `storage smoke test at ${new Date().toISOString()}`

async function main() {
  const storage = getServerStorage()
  const provider = serverStorageBackend()
  console.log(`[smoke] provider=${provider} bucket=${BUCKET} key=${KEY}`)

  // 1. upload
  await storage.upload(BUCKET, KEY, Buffer.from(PAYLOAD), {
    contentType: 'text/plain',
  })
  console.log('[smoke] upload OK')

  // 2. signed URL
  const signed = await storage.getSignedUrl(BUCKET, KEY, 60)
  console.log(`[smoke] signed URL OK (${signed.slice(0, 60)}...)`)

  // 3a. download via storage API (in-process)
  const blob = await storage.download(BUCKET, KEY)
  const text = await blob.text()
  if (text !== PAYLOAD) {
    throw new Error(`[smoke] FAIL download mismatch — got: ${text}`)
  }
  console.log('[smoke] download OK (content roundtrip verified)')

  // 3b. download via signed URL (HTTP fetch — proves the URL works end-to-end)
  const resp = await fetch(signed)
  if (!resp.ok) {
    throw new Error(`[smoke] FAIL signed-URL fetch ${resp.status}`)
  }
  const httpText = await resp.text()
  if (httpText !== PAYLOAD) {
    throw new Error(`[smoke] FAIL signed-URL content mismatch`)
  }
  console.log('[smoke] signed-URL fetch OK')

  // 4. delete
  await storage.delete(BUCKET, KEY)
  console.log('[smoke] delete OK')

  console.log('[smoke] ALL OPS PASSED')
}

main().catch((err) => {
  console.error('[smoke] FAIL', err)
  process.exit(1)
})
