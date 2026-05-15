---
id: SEED-019
status: dormant
planted: 2026-05-15
planted_during: v3.1.1 MVP Launch Prep (during scope discussion)
trigger_when: When Supabase Storage usage crosses 800 MB (80% of 1 GB Free limit) OR when migrating to Hetzner Cloud (SEED-018)
scope: Small
---

# SEED-019: Migrate File Storage to Hetzner Object Storage

> **Pre-work shipped in v3.1.1:** `lib/storage/` abstraction layer + `lib/storage/s3-provider.ts` skeleton + `docs/STORAGE-MIGRATION.md` runbook. This seed is the actual cut-over.

## Why This Seed Exists

Supabase Storage Free tier caps at **1 GB**. Realistic per-project storage usage:

- Audio (.ogg/opus, 2-min compressed): ~1 MB
- Photos (5 photos, JPEG-compressed): ~2-5 MB
- PDF generated: ~200 KB
- **Total per project: ~5-10 MB**

So 1 GB caps at ~100-200 projects. With 10 active customers doing 5 estimates/month, storage fills in 2-3 months.

**Hetzner Object Storage** is S3-compatible at €0.99/TB/month + €0.99/TB egress. Migrating saves money AND removes the storage cap entirely.

## When to Surface

**Trigger (any of):**
- `node supabase/audits/check-storage-usage.mjs` reports >800 MB used
- Phase 68 (Hetzner deploy in v3.2) is being planned — do storage migration same day
- First user complaint about upload failure due to storage quota

This seed should surface during `/gsd:new-milestone` when:
- Milestone involves cost optimization
- Milestone involves Hetzner migration
- Milestone explicitly named "storage migration"

## What Needs to Be Done (when triggered)

### Pre-flight (verify v3.1.1 prep done)

- [ ] `lib/storage/index.ts` exports `StorageProvider` interface
- [ ] `lib/storage/s3-provider.ts` implements interface against `@aws-sdk/client-s3`
- [ ] All app code uses `storage.*` API, zero direct `supabase.storage.from()` calls outside `lib/storage/`
- [ ] `docs/STORAGE-MIGRATION.md` exists with the procedure below

### Migration steps (same day, ~2 hours)

1. **Provision Hetzner Object Storage**
   - Login Hetzner Cloud console → Object Storage → Create bucket
   - Region: Falkenstein (FSN1) for EU latency or Helsinki (HEL1) for cheaper egress
   - Create 5 buckets matching current Supabase: `audio`, `photos`, `pdfs`, `logos`, `platform-brand`
   - Or single bucket with prefix segregation: `xtimator/{audio|photos|pdfs|logos|platform-brand}/...`
2. **Generate S3 credentials**
   - Hetzner Console → Object Storage → Credentials → Create new
   - Save `S3_ACCESS_KEY` + `S3_SECRET_KEY` to password manager AND `.env.production`
3. **Mirror existing data** (one-time)
   ```bash
   # Configure aws CLI for both endpoints
   aws s3 sync s3://supabase-bucket s3://hetzner-bucket \
     --endpoint-url https://hel1.your-objectstorage.com \
     --source-endpoint-url https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/s3
   ```
   Or write `scripts/migrate-storage.mjs` using `@aws-sdk/client-s3` directly.
4. **Set env vars on app server (Hetzner VPS)**
   ```
   STORAGE_PROVIDER=s3
   S3_ENDPOINT=https://hel1.your-objectstorage.com
   S3_REGION=eu-central
   S3_ACCESS_KEY=...
   S3_SECRET_KEY=...
   S3_PUBLIC_URL_BASE=https://xtimator.your-objectstorage.com
   ```
5. **Restart app, smoke test**
   - Upload new audio → should land in Hetzner bucket
   - View existing share page → PDF should still load (mirrored)
   - Delete a test photo → should delete from Hetzner
6. **Burn-in (24-48h)**
   - Monitor for failed uploads in Sentry / app logs
   - Compare bucket sizes (Supabase shouldn't grow new content)
7. **Cut over fully**
   - One-week rolling window after which any file ONLY in Supabase but not Hetzner triggers re-mirror
   - When confident, downgrade Supabase plan or just stop using Supabase Storage
8. **Document signed-URL contract change**
   - Hetzner signed URLs use S3 V4 signing (different format than Supabase)
   - PDFs already deliver via signed URLs (Phase 53), so nothing should break, but verify with WhatsApp media test

## Hetzner Object Storage Notes

- **API:** S3-compatible v4 signing — works with `@aws-sdk/client-s3`
- **Pricing (current):** €0.99/TB-month storage + €0.99/TB egress, no minimum
- **Regions:** FSN1 (Falkenstein), HEL1 (Helsinki)
- **CORS:** configurable per bucket — needed for direct browser uploads (we don't do those today, all uploads go through server, so this is a v3.x worry)
- **Public access:** can mark bucket as public-read (useful for `platform-brand` bucket); private-by-default for tenant data
- **TTL on signed URLs:** up to 7 days, same as Supabase

## Scope Estimate

**Small** — 1 phase, ~half a day if abstraction prep is done. Without prep, would be Medium (~2-3 days).

## Breadcrumbs

- `lib/storage/` (will exist after v3.1.1 Phase 67) — abstraction layer
- `docs/STORAGE-MIGRATION.md` (will exist after v3.1.1 Phase 67) — full runbook
- `lib/whatsapp/pdf-delivery.ts` — uses signed URL pattern, biggest test case
- `app/api/upload-audio/route.ts` (or similar) — uploads
- `lib/services/generate-estimate.ts` — references storage paths
- SEED-018 — sibling seed (Hetzner Cloud VPS migration); recommend doing both same day

## Notes

- **Trigger threshold:** 800 MB Supabase storage = "act now". Set up `node supabase/audits/check-storage-usage.mjs` as part of run-prod-readiness checks (already discussed in v3.1.1 conversation, may or may not have been added).
- **Hetzner Object Storage is cheaper than Supabase Pro** for storage workloads (€1/TB vs $25/mo flat).
- **Public bucket asset URLs** will change from `xxx.supabase.co/storage/v1/object/public/...` to Hetzner equivalent — need to either redirect old URLs or accept some assets will 404 if cached externally.
- **Cron purges** still apply (Phase 18 cleanup orphans, Phase 43 WhatsApp session cleanup) — they call `storage.delete()` so no change needed there.
