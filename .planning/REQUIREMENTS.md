# Requirements: Xtimator — Milestone v4.24 Same-Origin Storage on R2

**Defined:** 2026-08-05
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Serve every user-uploaded and platform asset from the app's own origin, backed by Cloudflare R2, so images land on the CDN that already fronts `xtimator.com` and Supabase Storage egress goes to zero.

> **Locked decisions (owner-confirmed / field-verified 2026-08-05):**
> - **Target is Cloudflare R2**, not Hetzner Object Storage as the original Phase-66 runbook assumed — same Cloudflare account as the CDN, free egress, no new vendor.
> - **Five R2 buckets named exactly `audio` / `photos` / `pdfs` / `logos` / `platform-brand`** — 1:1 with the bucket argument the app already passes to `StorageProvider`, so `s3-provider.ts` needs zero changes. Explicitly NOT one bucket with key prefixes.
> - `lib/storage/s3-provider.ts` is **already verified working against R2 unmodified** — `scripts/storage-smoke.ts` passed upload → signed URL → in-process download → HTTP fetch of the signed URL → delete, with `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true`, endpoint `https://<account-id>.r2.cloudflarestorage.com`. Do not re-litigate the provider.
> - **Supabase read-through fallback is mandatory during cutover** — any object not yet in R2 is served from Supabase instead of 404ing. No image may ever break, in either direction.
> - **Reversibility is a hard requirement** — removing the R2 env vars must return the app to Supabase with no code change and no data migration.
> - **The trigger is egress, not stored volume.** 14.3 MB stored is 1.8 % of the old 800 MB trigger, but landing-page images alone burn ~1.9 GB of Supabase egress per 1 000 cold visits. The 800 MB threshold in `docs/STORAGE-MIGRATION.md` measures the wrong thing and is superseded.
> - **`STORAGE_PROVIDER=s3` must never half-apply.** Today it is honored only by `getServerStorage()` (4 call sites) while ~20 sites call `createStorage(client)` and get Supabase unconditionally — flipping the flag as-is makes the WhatsApp adapter write to R2 while readers read Supabase, producing silent 404s on inbound media. Either the flag switches everything server-side or it switches nothing.
> - **S3 credentials must never reach the browser.** The five direct-from-browser upload call sites move to server-issued presigned PUTs.
> - **No secrets in the repo** — `.env.local.example` and all docs use placeholders only; real values live in `.env.local` (gitignored) and Coolify.
> - Cloudflare CDN is already live on `xtimator.com` (`docs/CLOUDFLARE-CDN.md`) — this milestone does not re-do the CDN, it makes images actually reach it.
> - Model orchestration for execution: Fable orchestrates, Opus validates (plan-check/verify), Sonnet executes, Haiku simple work; maximize parallelism.

## v4.24 Requirements

### Same-Origin Asset Proxy (PROXY)

- [ ] **PROXY-01**: A same-origin route on `xtimator.com` serves any storage object by bucket + key, streaming it from R2 with the object's original content type preserved.
- [ ] **PROXY-02**: When an object is absent from R2, the route transparently falls back to Supabase Storage and still returns the bytes — so no asset can 404 at any point during or after the cutover, in either migration direction.
- [ ] **PROXY-03**: The route rejects path traversal and any key outside the five known buckets, and never exposes storage credentials or signed backend URLs to the client.
- [ ] **PROXY-04**: Publicly-readable assets (logos, platform branding) are served with a long-lived immutable cache header so Cloudflare caches them at the edge; assets belonging to a tenant's private data are not edge-cached.
- [ ] **PROXY-05**: A landing-page load fetches its images from `xtimator.com` rather than `*.supabase.co`, and repeat edge requests for those images report a Cloudflare cache HIT.

### Provider Selection Integrity (PROV)

- [ ] **PROV-01**: Every server-side storage read and write resolves through one provider selection, so `STORAGE_PROVIDER` switches the whole server at once and cannot leave writers and readers on different backends.
- [ ] **PROV-02**: An automated check fails the build if a server-side module reintroduces a hardcoded Supabase-only storage path, keeping the provider seam from silently rotting the way it did after Phase 66.
- [ ] **PROV-03**: With R2 configured, the WhatsApp inbound media path (the concrete case that would have broken) writes and reads the same backend end-to-end.

### Browser Uploads Without Browser Credentials (UPLOAD)

- [ ] **UPLOAD-01**: A user can record audio and upload photos from the browser with the file landing in the configured backend, without any storage credential reaching client code.
- [ ] **UPLOAD-02**: The upload endpoint authorizes the caller and confines the resulting key to that tenant's namespace, so one tenant cannot write into another's prefix.
- [ ] **UPLOAD-03**: The uploaded object retains its correct content type, so images render inline rather than downloading — verified end-to-end through the proxy, including keys with no file extension.
- [ ] **UPLOAD-04**: Existing upload behavior the field depends on is preserved: retry on transient failure, and the capture flow's offline/queue handling still works.

### Portable Asset URLs (URL)

- [ ] **URL-01**: Newly stored assets produce a same-origin relative URL, so the storage backend is no longer baked into any value the app persists.
- [ ] **URL-02**: Existing rows holding absolute Supabase URLs (`companies.logo_url`, `profiles.avatar_url`, price-book image URLs, platform branding and SEO assets) are rewritten to the new form, with a reversible record of what changed.
- [ ] **URL-03**: Every surface that renders these assets — app UI, public share pages, PDFs, and email/WhatsApp sends — resolves the new relative URLs correctly, including the server-side PDF renderer which cannot rely on a browser origin.
- [ ] **URL-04**: The content security policy permits the new same-origin image source, and is not left broader than the new setup requires.

### Object Migration & Verification (MIG)

- [ ] **MIG-01**: An operator can copy all existing Supabase objects into R2 with a repeatable, re-runnable command that is safe to run twice.
- [ ] **MIG-02**: The migration reports per-object verification — count, byte size, and content type compared between source and destination — and fails loudly on any mismatch rather than reporting success.
- [ ] **MIG-03**: The five R2 buckets exist with public access disabled, and the credential used by the app is scoped to only those buckets.
- [ ] **MIG-04**: The runbook documents the cutover and the rollback, states the verified R2 settings, and contains no real secrets.

## Future Requirements (deferred)

- **FUT-R2-01**: Disable the Supabase read-through fallback once production is proven stable, so a missing object surfaces as a loud error instead of silently costing Supabase egress again.
- **FUT-R2-02**: Decommission Supabase Storage entirely (delete buckets) after a retention window with the fallback disabled and no fallback hits observed.
- **FUT-R2-03**: Serve tenant-private assets through short-lived signed URLs at the edge rather than proxying every byte through the app server.
- **FUT-R2-04**: Image transformation/resizing at the edge (the landing page currently ships full-size images; ~1.9 MB per cold visit is a payload problem the CDN caches but does not shrink).

## Out of Scope

- **Migrating to Hetzner Object Storage** — the original Phase-66 target. R2 wins on free egress and colocates with the CDN already fronting the app; adding a second storage vendor has no upside here.
- **One bucket with key prefixes** — rejected in favor of five name-matched buckets because it would require changing a provider that is already verified working against R2.
- **Re-doing or extending the Cloudflare CDN layer** — already live and verified (`docs/CLOUDFLARE-CDN.md`). This milestone only makes images reach it.
- **Changing the storage key convention** (`lib/storage/keys.ts`) — the existing `{companyId}/{type}/{timestamp}-{filename}` scheme is carried over as-is; re-keying objects during a backend swap would conflate two migrations.
- **Moving Supabase Postgres or Auth** — this milestone is storage only.

## Traceability

Filled by the roadmapper.
