# Phase 187: R2 Provisioning & Same-Origin Asset Proxy — Context

**Gathered:** 2026-08-06
**Status:** Ready for planning
**Source:** Direct field investigation (2026-08-05/06), not a discuss-phase session. Every fact below was verified hands-on against production, not inferred.

## Already DONE before planning starts — do not re-plan

**MIG-03 is closed.** The operator provisioned it on 2026-08-06:

- Five R2 buckets exist: `audio`, `photos`, `pdfs`, `logos`, `platform-brand` — all Standard class, location **WEUR** (co-located with the Hetzner origin at `188.245.112.3`), and **public `r2.dev` access disabled on all five**, verified via the Cloudflare API.
- One Account API token (`xtimator app`, Object Read & Write) scoped to exactly those five buckets and nothing else.
- Verified working: `scripts/storage-smoke.ts` run against `pdfs`, `photos`, `logos`, `platform-brand` — upload → signed URL → in-process download → HTTP fetch of the signed URL → delete, **all ops passing on each bucket**.
- The throwaway `xtimator` smoke bucket was deleted.

So the plan must NOT include creating buckets or tokens. It MAY include a
verification step that asserts the five buckets are reachable and that public
access is off, since Success Criterion 5 has to be demonstrable.

**Credentials are deliberately NOT in `.env.local` and NOT in Coolify.** They
live in the operator's scratchpad. Reason: `STORAGE_PROVIDER=s3` currently
half-applies (see below), so wiring credentials in before Phase 188 fixes the
provider seam would cause split-brain writes. Planning must respect this — the
proxy has to work with R2 configured OR not configured, and local verification
uses inline env vars, never a committed `.env.local` change. `scripts/storage-smoke.ts`'s own docblock already states this convention ("env vars inline — never write to .env.local").

## Locked decisions

- **Target is Cloudflare R2**, not Hetzner Object Storage as the original Phase-66 runbook assumed. Same Cloudflare account as the CDN already fronting `xtimator.com`, free egress.
- **Five buckets named 1:1 with the app's existing bucket argument** — NOT one bucket with key prefixes. This is why `lib/storage/s3-provider.ts` needs zero changes.
- **`lib/storage/s3-provider.ts` is already proven against R2 unmodified.** Required settings: `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true`, endpoint `https://<account-id>.r2.cloudflarestorage.com`. Do not re-validate the provider; do not "fix" it.
- **Supabase read-through fallback is mandatory and is the point of this phase.** It is what makes every later phase reversible: with it in place, objects can be copied to R2 in any order, and removing the R2 env vars returns the app to Supabase with no data migration.
- **The five bucket names are the allowlist.** Any bucket outside `audio|photos|pdfs|logos|platform-brand` is refused (Success Criterion 3).
- **Public vs private caching is a real distinction, not cosmetic.** `logos` and `platform-brand` are the two buckets that are PUBLIC in Supabase today and are what the landing page renders; `photos`, `audio`, `pdfs` hold tenant data. Only the former may carry a long-lived immutable cache header — a tenant's job-site photo must never be cached at Cloudflare's edge (Success Criterion 4).
- **Reversibility is a hard requirement** for the whole milestone.
- **No secrets in the repo** — `.env.local.example` and docs use placeholders only.

## Why this phase exists (verified problem statement)

The Cloudflare CDN is live on `xtimator.com` (`docs/CLOUDFLARE-CDN.md`), and
static assets cache correctly (MISS → HIT verified). But **images bypass the
edge entirely**: the landing page pulls **41 image references, ~1.9 MB per cold
visit, all from `prmqgcrnpuvpzruyzvuv.supabase.co`** — a different origin. A
same-origin route is the thing that puts them on the CDN. That is the payoff
this phase unlocks; PROXY-05 (proving the cache HIT) is deliberately deferred
to Phase 192, after URLs are actually rewritten.

Production scale is small — **51 objects, 14.3 MB** (photos 11 MB,
platform-brand 2.8 MB, logos 55 kB, audio 55 kB, pdfs 0). Nothing here needs
batching, windowing, or streaming-at-scale engineering.

## Known landmines in the existing code

- **`STORAGE_PROVIDER` half-applies today.** `getServerStorage()` honors it (4 call sites: `app/api/health`, `lib/actions/admin-whatsapp.ts`, `lib/estimate/adapters/whatsapp.ts` ×2). ~20 other sites call `createStorage(client)`, which returns the Supabase provider **unconditionally**. Phase 188 fixes this. Phase 187 must not depend on the flag being trustworthy, and must not make it worse.
- **`getPublicUrl()` returns absolute Supabase URLs that are persisted in DB rows.** Phase 190/192 handle that. Phase 187 only needs the route to exist and serve correctly; it does not rewrite any data.
- **Keys frequently have no file extension** (e.g. `platform/1784854705622-kvwo24`). Content type therefore cannot be inferred from the path — it must come from the stored object's metadata. This is exactly what makes Success Criterion 1 non-trivial, and it is a verified property of real production keys.
- The route sits behind Cloudflare with an **origin that redirects HTTP→HTTPS**, and the zone is on **Full (strict)**.

## Claude's discretion

- Exact route path and shape (`/storage/...` vs `/api/storage/...`), and whether bucket is a path segment or encoded in the key.
- Streaming strategy (pass-through stream vs buffer) — production objects are small, so correctness and content-type fidelity outweigh throughput.
- How the fallback decides "absent from R2" (error-code inspection vs existence probe), and whether a fallback hit is logged/counted so FUT-R2-01 can later prove the fallback is unused.
- How public-vs-private caching is expressed (per-bucket policy table vs explicit allowlist).
- Test strategy and where the verification for Success Criterion 5 lives.

## Out of scope for this phase

- Rewriting any DB rows or changing `getPublicUrl()` output (Phases 190/192).
- Fixing the `createStorage` provider seam (Phase 188).
- Browser presigned uploads (Phase 189).
- Copying objects into R2 (Phase 191) — the fallback is precisely what makes the empty-R2 state safe.
- Proving the Cloudflare cache HIT on real landing images (PROXY-05, Phase 192).
