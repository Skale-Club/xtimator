# Storage Migration: Supabase → Hetzner Object Storage

**Status:** Documented, **NOT executed**. Target revised to **Cloudflare R2**
(2026-08-05) — see the field assessment below before planning any cutover.
**Trigger threshold:** ⚠️ the 800 MB figure below is the wrong metric — egress
binds first. See §4 of the field assessment.
**Owner:** Whoever is on-call when the trigger fires.
**Estimated wall-clock for full migration:** 1.5–3 hours (depends on bucket sizes and link speed).

---

## ⚠️ Field assessment — 2026-08-05 (read this before trusting the rest)

A hands-on assessment corrected several claims below. The sections after this
one are the ORIGINAL Phase-66 plan; where they conflict with this block, this
block wins.

**1. It is NOT a 1-line change.** `STORAGE_PROVIDER=s3` is only honored by
`getServerStorage()`, which has **4 real call sites** (`app/api/health`,
`lib/actions/admin-whatsapp.ts`, `lib/estimate/adapters/whatsapp.ts` ×2).
Every other site calls `createStorage(client)`, which returns the Supabase
provider **unconditionally** — ~20 files. The STORAGE-03 grep gate proved
there are no raw `supabase.storage.from(...)` calls; it did NOT prove the
provider is swappable.

**Flipping the flag today is actively harmful**, not merely incomplete: the
WhatsApp adapter would write audio/photos to R2 while every read path still
reads Supabase → silent 404s on inbound WhatsApp media.

**2. Browser uploads cannot follow the flag.** Five client components upload
straight from the browser via `createStorage(supabaseBrowserClient)`
(`capture-recorder`, `inline-audio-recorder`, `photo-card`, `photo-lightbox`,
`estimate-document`). S3 credentials must never reach the browser, so this
path needs a server-issued presigned-PUT route before any cutover.

**3. Public URLs are absolute and persisted.** `getPublicUrl()` returns a
fully-qualified `https://<project>.supabase.co/...` URL that is written into
DB rows (`companies.logo_url`, `profiles.avatar_url`, price-book image URLs,
platform branding/SEO). Swapping providers changes only NEWLY written URLs;
existing rows keep pointing at Supabase. A cutover therefore needs a
same-origin proxy route + a row rewrite, not just a provider swap.

**4. The trigger threshold is measuring the wrong thing.** Actual usage on
2026-08-05: **51 objects, 14.3 MB** (photos 11 MB / platform-brand 2.8 MB /
logos 55 kB / audio 55 kB / pdfs 0) — 1.8 % of the 800 MB trigger. Storage
volume will not bind for a very long time. **Egress will bind first**: the
public landing page alone pulls **1.9 MB of images per cold visit**, all from
`*.supabase.co`, i.e. ~1.9 GB of Supabase egress per 1 000 cold visits.
Re-derive the trigger from the egress allowance, not from stored bytes.

**5. Cloudflare CDN does not currently help images.** As of 2026-08-05
`xtimator.com` is proxied through Cloudflare (see `docs/CLOUDFLARE-CDN.md`),
but images are served from `*.supabase.co`, a different origin — they bypass
the edge entirely. Moving storage behind a same-origin `/storage/` proxy is
what would put images on the CDN. That is the main argument for this
migration, and it is a bigger one than cost.

### What IS already verified (2026-08-05)

- **Target is Cloudflare R2, not Hetzner** — same account as the CDN, free
  egress, no new vendor.
- `lib/storage/s3-provider.ts` works against **R2 unmodified**. Proven by
  `scripts/storage-smoke.ts` against a real R2 bucket: upload → signed URL →
  in-process download → HTTP fetch of the signed URL → delete, all passing.
  Required settings: `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true`,
  endpoint `https://<account-id>.r2.cloudflarestorage.com`.
- Bucket `xtimator` exists (Standard, WEUR, public access disabled) with a
  scoped Object-Read-&-Write token. Credentials are NOT in `.env.local` and
  NOT in Coolify — deliberately, so nothing can half-activate (see §1).

### Open design decision for the migration phase

`s3-provider.ts` passes the app's bucket argument straight through as the S3
bucket name, and the app uses five: `platform-brand` (22 call sites),
`photos` (10), `logos` (10), `pdfs` (3), `audio` (2). So either:

- **(a)** create five R2 buckets with those exact names — zero provider
  changes, matches the original runbook; or
- **(b)** keep one bucket and map app-bucket → key prefix inside the provider
  — one bucket to manage, one scoped token, but a provider change.

Not decided here on purpose: it belongs with the proxy/presign work.

---

## Why this is a 1-line change

> **Superseded** — see §1 of the field assessment above. Kept for context on
> what Phase 66 intended.

Phase 66 introduced `lib/storage/` — every storage call site in the app routes through the `StorageProvider` interface. There is no direct `supabase.storage.from(...)` call left in `app/`, `lib/`, or `components/` (verified by the STORAGE-03 grep gate).

Switching providers means **flipping `STORAGE_PROVIDER=s3`** and supplying the `S3_*` env vars. **No application code changes. No call site changes. No deployment of a new build is even strictly required** — the lazy `require('./s3-provider')` inside `getServerStorage()` picks up the new env on the next cold start (or on `docker compose up -d --force-recreate` for the VPS host).

---

## When to trigger

- **Hard trigger:** Supabase Storage usage hits 800 MB (check via Supabase dashboard → Storage → Usage)
- **Soft trigger:** Egress costs become noticeable on the monthly Supabase bill
- **Strategic trigger:** Moving to Hetzner Cloud VPS (Phase 68 deploy artifacts) — co-locate storage with compute for zero-cost intra-region traffic

---

## Pre-migration checklist

- [ ] Storage usage measured and recorded (per bucket, total)
- [ ] All five buckets enumerated: **`audio`**, **`photos`**, **`pdfs`**, **`logos`**, **`platform-brand`**
- [ ] Maintenance window scheduled (writes paused during sync — typical 30–60 min depending on size)
- [ ] Hetzner account in good standing
- [ ] Daily Supabase backup confirmed taken (Phase 61 baseline runbook)
- [ ] `aws-cli` v2 installed locally — `brew install awscli` / `apt install awscli` / Windows installer
- [ ] `scripts/storage-smoke.ts` executed against the destination (Hetzner) BEFORE the cutover — proves credentials + endpoint shape are correct

---

## Step 1 — Provision Hetzner Object Storage

1. Log in to **Hetzner Cloud Console** → **Object Storage**
2. Create a new project (or use the existing one that hosts the VPS)
3. Choose region — recommend **`fsn1`** (Falkenstein) or **`nbg1`** (Nuremberg) for EU latency. Match the VPS region for free intra-region traffic.
4. Create five buckets matching the current Supabase bucket names exactly:
   - `audio`
   - `photos`
   - `pdfs`
   - `logos`
   - `platform-brand`
5. Generate S3 credentials: **Project Settings → S3 Credentials → Generate**
   - Save **Access Key ID** + **Secret Access Key** in your password manager
   - Hetzner endpoint shape: `https://<region>.your-objectstorage.com` (e.g. `https://fsn1.your-objectstorage.com`)

### Bucket public-access policy

The `logos` and `platform-brand` buckets currently serve content via `getPublicUrl()` (synchronous, unsigned). On Hetzner you must mark these two buckets as **public read** during provisioning, otherwise public logo URLs will 403 in the browser. The other three (`audio`, `photos`, `pdfs`) stay private — they only ever serve via signed URLs.

---

## Step 2 — Sync data (`aws s3 sync`)

Configure two `aws-cli` profiles — one for the source (Supabase Storage exposes an S3-compatible endpoint), one for the destination (Hetzner):

```bash
aws configure --profile supabase
# AWS Access Key ID:     <supabase-storage-s3-access-key>     # placeholder shape: s3_access_key_<your-key>
# AWS Secret Access Key: <supabase-storage-s3-secret>         # placeholder shape: s3_secret_<your-key>
# Default region:        us-east-1
# Default output:        json

aws configure --profile hetzner
# AWS Access Key ID:     <hetzner-objectstorage-access-key>   # placeholder shape: s3_access_key_<your-key>
# AWS Secret Access Key: <hetzner-objectstorage-secret>       # placeholder shape: s3_secret_<your-key>
# Default region:        fsn1
# Default output:        json
```

**Pause writes** before sync — easiest is to scale the Next.js host to zero replicas, or temporarily set the Vercel project to "paused". If you can't pause writes, plan a second incremental sync immediately after cutover (S3 sync only copies what's new/changed).

Run sync per bucket — this is the load-bearing command for STORAGE-06:

```bash
SUPABASE_S3_ENDPOINT="https://<your-supabase-project-ref>.supabase.co/storage/v1/s3"
HETZNER_S3_ENDPOINT="https://fsn1.your-objectstorage.com"

# Stage 1: download from Supabase to a local working dir
mkdir -p ./migration-staging
for BUCKET in audio photos pdfs logos platform-brand; do
  echo "=== Downloading $BUCKET from Supabase ==="
  aws --profile supabase --endpoint-url "$SUPABASE_S3_ENDPOINT" \
    s3 sync "s3://$BUCKET" "./migration-staging/$BUCKET" \
    --no-progress --only-show-errors
done

# Stage 2: upload from working dir to Hetzner
for BUCKET in audio photos pdfs logos platform-brand; do
  echo "=== Uploading $BUCKET to Hetzner ==="
  aws --profile hetzner --endpoint-url "$HETZNER_S3_ENDPOINT" \
    s3 sync "./migration-staging/$BUCKET" "s3://$BUCKET" \
    --no-progress --only-show-errors
done
```

(Direct S3-to-S3 sync between two non-AWS endpoints is unreliable in current `aws-cli`; the two-stage pattern above is robust and auditable.)

### Verify object counts match per bucket

```bash
for BUCKET in audio photos pdfs logos platform-brand; do
  SUPA=$(aws --profile supabase --endpoint-url "$SUPABASE_S3_ENDPOINT" s3 ls "s3://$BUCKET" --recursive | wc -l)
  HETZ=$(aws --profile hetzner  --endpoint-url "$HETZNER_S3_ENDPOINT"  s3 ls "s3://$BUCKET" --recursive | wc -l)
  echo "$BUCKET: supabase=$SUPA hetzner=$HETZ $([ "$SUPA" = "$HETZ" ] && echo OK || echo MISMATCH)"
done
```

All five lines must end with `OK` before continuing.

---

## Step 3 — Smoke-test Hetzner BEFORE swapping production

Run the project's smoke script (see `scripts/storage-smoke.ts`) against Hetzner with a throwaway `smoketest` bucket — proves the endpoint, region, access key, and secret key are correct before flipping production traffic:

```bash
STORAGE_PROVIDER=s3 \
  S3_ENDPOINT=https://fsn1.your-objectstorage.com \
  S3_REGION=fsn1 \
  S3_ACCESS_KEY_ID=s3_access_key_<your-hetzner-key> \
  S3_SECRET_ACCESS_KEY=s3_secret_<your-hetzner-key> \
  S3_FORCE_PATH_STYLE=true \
  npx tsx scripts/storage-smoke.ts smoketest
```

Expected output: 5 lines ending in `OK` plus `[smoke] ALL OPS PASSED`. If anything fails, **stop here** and fix the credentials/endpoint/bucket policy before touching production.

---

## Step 4 — Swap the application provider (the 1-line change)

Add to production env (Vercel dashboard → **Settings → Environment Variables**, or the `.env` on the Hetzner VPS host):

```bash
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://fsn1.your-objectstorage.com
S3_REGION=fsn1
S3_ACCESS_KEY_ID=s3_access_key_<your-hetzner-key>
S3_SECRET_ACCESS_KEY=s3_secret_<your-hetzner-key>
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_URL_BASE=https://fsn1.your-objectstorage.com
```

Redeploy:
- **Vercel:** trigger redeploy from the dashboard, or `vercel --prod`
- **Hetzner VPS (Phase 68 target):** `docker compose up -d --force-recreate`

Validate the cutover:
- `curl https://your-domain/api/health` should return `storage: 'ok'` (Phase 68 health check uses `getServerStorage()`)
- The four config knobs: **endpoint**, **region**, **access key**, **secret key** — confirm all four are present in the deployed env

---

## Step 5 — Production smoke test

Run a controlled UAT-style smoke against production:

1. Generate one estimate with audio + 1 photo — confirm both upload successfully
2. Send the estimate as PDF via WhatsApp — confirm the signed URL returns the PDF (24h TTL)
3. Open the share link — confirm the estimate page renders with the company logo (`logos` bucket → public URL)
4. Inbound WhatsApp message with a photo — confirm it lands in the `photos` bucket and the AI vision pipeline reads it

If any of the above fails, **execute the rollback procedure immediately**.

---

## Step 6 — Decommission Supabase Storage (after 7 days)

After 7 days of incident-free operation:

1. Take a final backup snapshot of the Supabase buckets to local cold storage:
   ```bash
   for BUCKET in audio photos pdfs logos platform-brand; do
     aws --profile supabase --endpoint-url "$SUPABASE_S3_ENDPOINT" \
       s3 sync "s3://$BUCKET" "./supabase-storage-backup/$BUCKET"
   done
   ```
2. Delete Supabase Storage buckets via the dashboard
3. Remove Supabase Storage RLS policies from migrations (cosmetic — they target deleted buckets)
4. Remove the `migration-staging/` working directory

---

## Rollback procedure

If anything misbehaves in the **first 24 hours**:

1. Set `STORAGE_PROVIDER=supabase` (or simply remove the env var) and redeploy
2. App returns to reading from Supabase Storage immediately — **the data was never deleted from Supabase during steps 1–5**, so the rollback is instant and data-loss-free
3. Investigate the failure offline; re-attempt migration after fix

If failures appear **between day 2 and day 7** (after some new objects have been written to Hetzner):

1. Set `STORAGE_PROVIDER=supabase` and redeploy
2. Re-run the Stage 1 + Stage 2 sync **in reverse** to copy any net-new Hetzner objects back to Supabase:
   ```bash
   for BUCKET in audio photos pdfs logos platform-brand; do
     aws --profile hetzner  --endpoint-url "$HETZNER_S3_ENDPOINT"  s3 sync "s3://$BUCKET" "./rollback-staging/$BUCKET"
     aws --profile supabase --endpoint-url "$SUPABASE_S3_ENDPOINT" s3 sync "./rollback-staging/$BUCKET" "s3://$BUCKET"
   done
   ```
3. Investigate the failure; do not re-attempt until the root cause is fixed

---

## Cost reference (informational)

| Item                  | Supabase (Free / Pro) | Hetzner Object Storage |
|-----------------------|----------------------|------------------------|
| Storage / GB / month  | included up to 1 GB  | EUR 0.0095             |
| Egress / GB           | 5 GB free / 0.09 EUR | EUR 0.01               |
| API calls             | unmetered            | unmetered              |

For typical Xtimator load (audio + photos + PDFs per estimate), Hetzner is roughly an order of magnitude cheaper at scale.

---

## Behavioral diffs (Supabase ↔ S3) to be aware of

- **`upsert: false` is best-effort on S3.** S3 PutObject is unconditional overwrite by default; the S3 provider does not block overwrites. All Xtimator callers use timestamped keys for guaranteed-new paths OR explicitly want overwrite (logos, branding) — so this is acceptable.
- **`getPublicUrl` returns path-style URLs** (`<endpoint>/<bucket>/<key>`). Both MinIO and Hetzner serve correctly under path-style; AWS S3 also supports it (deprecated for new buckets but functional).
- **Object metadata** (e.g. Supabase's `metadata.size`, `updated_at`) maps to S3's `Size`, `LastModified` — the StorageProvider normalizes both shapes to the same `ListedObject`.

---

## What to NEVER do

- **Do NOT delete Supabase Storage buckets in the same maintenance window as the cutover.** Wait the full 7 days — the rollback procedure depends on the source data still being there.
- **Do NOT commit real S3 credentials anywhere** — see CLAUDE.md "Secret Handling". Real credentials live only on the deploy target (Vercel env vars or `.env` on the VPS, both gitignored / out-of-tree).
- **Do NOT swap providers without first running `scripts/storage-smoke.ts` against the destination.** Phase 66 STORAGE-07 caught the abstraction holds in dev; you must re-prove it against Hetzner before flipping production.
- **Do NOT skip the bucket public-access policy** for `logos` and `platform-brand` — without it, every logo on the site 403s.
