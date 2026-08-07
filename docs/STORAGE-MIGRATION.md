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

**1. RESOLVED by Phase 188 (2026-08-06) — kept here for the historical
record, because the reason the bug existed is worth remembering.** Before
Phase 188, `STORAGE_PROVIDER=s3` was only honored by `getServerStorage()`,
which had **4 real call sites** (`app/api/health`,
`lib/actions/admin-whatsapp.ts`, `lib/estimate/adapters/whatsapp.ts` ×2).
Every other server call site called `createStorage(client)` directly, which
returned the Supabase provider **unconditionally** — roughly 20 files. The
Phase-66 STORAGE-03 grep gate proved there was no raw
`supabase.storage.from(...)` call left outside the abstraction; it did NOT
prove the provider was swappable, and it stayed green the entire time this
bug existed. **Flipping the flag would have been actively harmful, not
merely incomplete**: the WhatsApp adapter would have written audio/photos
to R2 while every read path still read Supabase — silent 404s on inbound
WhatsApp media.

**What Phase 188 changed:** every server-side storage decision now funnels
through one function, `serverStorageBackend()` in `lib/storage/server.ts`
(PROV-01). `createStorage(client)` in `lib/storage/index.ts` is no longer a
default-provider factory at all — it is the explicit, browser-safe Supabase
factory, reserved for browser call sites and the PROXY-02 read-through
fallback (`lib/storage/asset-source.ts`), which must stay pinned to
Supabase on purpose. A new census test,
`tests/unit/storage/storage-seam-census.test.ts` (PROV-02), enumerates
every storage call site mechanically via the TypeScript AST and fails the
test suite — and therefore CI, and therefore the deploy — if a server
module ever reintroduces a raw `createStorage(client)` call or a raw
`.storage.from(...)` escape hatch. Unlike the STORAGE-03 grep gate, this
census was proven to actually fail: four negative cases (an unlisted server
call site, a reintroduced raw escape hatch, a client component importing
the server seam, and manifest drift) were each run and observed RED before
being reverted — see the Phase 188 Plan 04 SUMMARY for the exact failure
output. See "Phase 188 — server-wide provider selection integrity" below
for the selection matrix as implemented, the RLS delta, and what this phase
deliberately did NOT fix.

**2. Browser call sites are a mix of uploads and reads — not "five" or
"six" uploads.** Six client components/hooks call
`createStorage(supabaseBrowserClient)` directly, but only THREE of them are
uploads: `capture-recorder.tsx`, `inline-audio-recorder.tsx`, and
`use-ai-input-submit.ts` (all upload to the `audio` bucket). The other three
call sites — `photo-card.tsx`, `photo-lightbox.tsx`,
`estimate-document.tsx` — call `.getSignedUrl(...)`, a READ, not an upload;
`capture-recorder.tsx` additionally has its own read call site (restoring
photo thumbnails via `getSignedUrl`), so the full operational count across
these 6 files is **3 uploads + 4 reads**. This was derived by reading each
call site's actual method call (`.upload(...)` vs `.getSignedUrl(...)`),
not assumed from an earlier draft's count. S3 credentials must never reach
the browser, so the 3 upload sites need a server-issued presigned-PUT route
before any cutover — that is Phase 189 (UPLOAD-01/02). The 4 read sites
need the same-origin asset proxy repointed at them instead — that is
Phase 190.

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
- **The five production buckets exist** (provisioned 2026-08-06, closing
  MIG-03): `audio`, `photos`, `pdfs`, `logos`, `platform-brand` — all
  Standard class, location WEUR (co-located with the Hetzner origin), and
  **public access (`r2.dev`) disabled on every one**, verified via the API.
  The throwaway `xtimator` smoke bucket has been deleted.
- A single Account API token (`xtimator app`, Object Read & Write) is scoped
  to exactly those five buckets and nothing else. Verified end-to-end by
  running `scripts/storage-smoke.ts` against `pdfs`, `photos`, `logos` and
  `platform-brand` — all ops passing on each.
- Credentials are NOT in `.env.local` and NOT in Coolify — deliberately, so
  nothing can half-activate (see §1). They stay in the operator's scratchpad
  until the cutover phase wires them in.

### MIG-03 — provisioning record and re-verification (Phase 187)

MIG-03 is closed. The table below is the provisioned state as of 2026-08-06;
`npm run verify:r2` (added by Phase 187 Plan 02, `scripts/r2-verify.ts`) is
the repeatable check that it is *still* true — it asserts, it never
provisions.

| Bucket | Class | Location | Public `r2.dev` access |
|---|---|---|---|
| `audio` | Standard | WEUR | disabled |
| `photos` | Standard | WEUR | disabled |
| `pdfs` | Standard | WEUR | disabled |
| `logos` | Standard | WEUR | disabled |
| `platform-brand` | Standard | WEUR | disabled |

WEUR was chosen to co-locate with the Hetzner origin (`188.245.112.3`).

One Account API token (`xtimator app`, Object Read & Write) is scoped to
exactly those five buckets. It lives in the operator's scratchpad —
deliberately **not** in `.env.local` and **not** in Coolify, because
`STORAGE_PROVIDER` only half-applies until Phase 188 rewrites
`getServerStorage()` (see §1 above), and wiring R2 credentials in early
would produce split-brain writes (some paths writing to R2, others still
reading Supabase).

**Phase-191 caution — resolved, see the concrete gate below.** The `S3_*`
vars had to stay out of Coolify until Phase 191 copied the objects into R2.
That copy is done (see "Phase 191 — R2 migration, cutover, and rollback"
above). The precondition that now actually lifts the prohibition —
`npm run migrate:r2 -- --verify-only` exiting 0 across all five buckets,
run immediately before the Coolify change — is stated in that section's
"Cutover" subsection; this paragraph is kept only so a reader who lands
here first knows where to look.

**Re-verification runbook** — placeholders only, env vars inline (never
written to `.env.local`, per `scripts/storage-smoke.ts`'s own convention):

```bash
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  S3_REGION=auto \
  S3_ACCESS_KEY_ID=<r2-access-key-id> \
  S3_SECRET_ACCESS_KEY=<r2-secret-access-key> \
  S3_FORCE_PATH_STYLE=true \
  CLOUDFLARE_ACCOUNT_ID=<account-id> \
  CLOUDFLARE_API_TOKEN=<r2-read-token> \
  npm run verify:r2
```

Omitting the two `CLOUDFLARE_*` vars downgrades the public-access
assertion to `SKIPPED` — `SKIPPED` is not a pass, and the script never
reports one on your behalf.

**Executed against live R2 on 2026-08-06 — 16/16 PASS, zero SKIP.** All five
buckets reachable; all five round-trips (upload → sign → download) passing;
`scope:xtimator — correctly denied`, which is the check that actually proves
the token cannot reach outside the five buckets; and all five
`public-access` assertions PASS with a short-lived Cloudflare R2 admin token
supplied inline. That admin token was revoked immediately afterwards — the
only R2 credential that persists is the bucket-scoped `xtimator app`.

Re-assert with a short-lived R2 read token whenever the bucket set changes.
Without the two `CLOUDFLARE_*` vars the public-access leg degrades to
`SKIPPED`, which is not a pass.

### CORS on the `audio` bucket — applied 2026-08-06

Browser uploads (Phase 189) PUT to a presigned R2 URL, which is
**cross-origin**. Without a CORS policy every browser upload fails at
cutover — and the Supabase code path hides this completely, so no test in
this repo can catch it. Applied:

| Field | Value |
|---|---|
| AllowedOrigins | `https://xtimator.com`, `https://www.xtimator.com`, `http://localhost:3000` |
| AllowedMethods | `PUT`, `GET`, `HEAD` |
| AllowedHeaders | `content-type` |
| ExposeHeaders | `etag` |
| MaxAgeSeconds | 3600 |

`ExposeHeaders: etag` is **load-bearing**, not decoration:
`lib/storage/upload-with-retry.ts` treats a 409 as success and uses the ETag
to confirm the object actually landed. Without it a retry cannot tell a
duplicate from a failure.

Note the production `xtimator app` token **cannot** set bucket CORS —
`PutBucketCors` returns `AccessDenied`, verified. That is correct
least-privilege, but it means any future CORS change needs an admin token
created and revoked for the occasion. Only `audio` needs a policy; the other
four buckets are never written from a browser.

### Object migration — executed and proven 2026-08-06

`npm run migrate:r2` was run against production. Evidence, in order:

| Step | Result |
|---|---|
| Initial copy | **55 copied, 0 failed** |
| Second run (idempotency) | 0 copied, 55 matched |
| `--verify-only` | zero writes, all matched |
| Deliberate corruption (truncated one object to 9 bytes) | **detected**, named the object, source vs destination size, exit 1 |
| Restore | 1 re-copied, all green |

The corruption drill matters more than the copy: without it, "ALL OBJECTS
VERIFIED" is an unfalsifiable claim.

**The object count is a moving target, not a constant.** It was 51 when this
migration was scoped and 55 by the time the copy ran — a live user uploaded
three audio recordings and a logo during the same working session. Anything
that hard-codes 51 (or 55) is wrong by construction; the command compares
live source against live destination on every run, which is what makes the
number irrelevant. It also means objects created between the copy and the
URL cutover exist only in Supabase — harmless, because the proxy falls back
there, and fixed by simply re-running the copy.

The script asserts, it never provisions — do not use it to "repair" a
bucket; a failing check means investigate by hand, not re-run with `--fix`.

### Open design decision for the migration phase

`s3-provider.ts` passes the app's bucket argument straight through as the S3
bucket name, and the app uses five: `platform-brand` (22 call sites),
`photos` (10), `logos` (10), `pdfs` (3), `audio` (2). So either:

- **(a)** create five R2 buckets with those exact names — zero provider
  changes, matches the original runbook; or
- **(b)** keep one bucket and map app-bucket → key prefix inside the provider
  — one bucket to manage, one scoped token, but a provider change.

Not decided here on purpose: it belongs with the proxy/presign work.

### Same-origin asset proxy (Phase 187, PROXY-01..04)

The proxy/presign work referenced above is now shipped, in its Phase 187
scope: a route exists and serves correctly. **Nothing in the app has been
repointed at it yet** — no DB row rewritten, no `getPublicUrl()` output
changed, no component/PDF/share page updated. That rewiring is Phase 190
(private buckets) and Phase 192 (public buckets, the CDN cache-HIT proof).

**Route:** `GET /storage/{bucket}/{key}`, where `{bucket}` is one of the five
allowlisted buckets and `{key}` is the object key, slash-separated,
path-encoded. Example: `/storage/platform-brand/platform/1784854705622-kvwo24`.

**Resolution order:** R2 first when the `S3_*` env vars are present, then a
Supabase read-through. R2 being empty is a supported steady state — that is
what makes Phases 190/191/192 reversible.

**W1 — the fallback direction limit, stated honestly.** The fallback is
*one-directional*: it covers "object is in Supabase but not yet in R2".
Removing the `S3_*` vars returns every read to Supabase with no code change
and no data movement **only while no object exists solely in R2**. That
holds today and through Phase 187, but stops holding once Phase 188 routes
server writes to R2 and Phase 189 sends browser uploads there — from that
point, rolling back also requires copying the R2-only objects back to
Supabase. Do not read the earlier sentence as an unconditional guarantee.

**R2 is detected by the presence of the `S3_*` vars, deliberately not by
`STORAGE_PROVIDER`** — that flag only half-applies until Phase 188 (see §1
above), and the Supabase read-through fallback makes R2-first safe under
every combination.

**Cache policy** — three rows, not two:

| Bucket | Audience | Key style | `Cache-Control` |
|---|---|---|---|
| `platform-brand` | public | timestamped keys | `public, max-age=31536000, immutable` |
| `logos` | public | stable keys, `upsert: true` | `public, max-age=300, stale-while-revalidate=86400` |
| `photos`, `audio`, `pdfs` | tenant-private | company-prefixed | `private, no-store` + `Vary: Cookie` |

`logos` overwrites the same URL when a company changes its logo or a user
changes their avatar, so `immutable` would pin the stale image in Cloudflare
**and** in browser caches that cannot be purged. `photos`/`audio`/`pdfs` are
tenant job-site data and must never enter Cloudflare's shared edge cache.
Moving logo/avatar writes to versioned keys (a Phase 190 candidate) would let
`logos` become immutable too.

**Access control:** private buckets require an authenticated caller who is a
`company_members` member of the key's leading company UUID; public buckets
are open. Two deliberate exclusions, called out for Phase 190:

1. **No platform-admin / support-mode bypass.** An admin cannot pull another
   company's private object through this route today. If an admin surface
   needs it, it must be added explicitly — silently widening a public URL's
   reach is exactly the leak this gate exists to prevent.
2. **No path for anonymous share pages or the server-side PDF renderer.**
   Both currently resolve tenant photos through signed URLs and keep doing
   so. Both are unauthenticated with respect to this route (the PDF renderer
   has no browser session at all), so both would be refused here today —
   Phase 190 must design their scoping explicitly rather than assume the
   proxy already serves them.

**Fallback observability:** the authoritative signal is the server-side
`[asset-proxy] fallback` warn line emitted by `lib/storage/asset-source.ts`.
The `X-Asset-Source: r2|supabase` response header is a convenience for manual
curling only — **it is edge-cached along with the body on public buckets**,
so a cached `supabase` value can outlive the condition it described.
FUT-R2-01 must count log lines, not headers (W3).

**Known limitations:** no Range/206 responses, no ETag revalidation,
whole-object pass-through only (51 objects / 14.3 MB — deliberate).

**Local verification runbook** — placeholders only:

```bash
# 1. Fallback path — R2 NOT configured (this is production's current state)
npm run dev
curl -sI http://localhost:9633/storage/platform-brand/<a-real-key>
# expect: 200, stored content type, x-asset-source: supabase,
#         cache-control: public, max-age=31536000, immutable
curl -sI http://localhost:9633/storage/logos/<a-real-key>
# expect: 200, cache-control: public, max-age=300, stale-while-revalidate=86400
curl -sI http://localhost:9633/storage/photos/<company-uuid>/<key>
# expect: 404 when unauthenticated (tenant data is gated)
curl -sI "http://localhost:9633/storage/estimates/x"               # expect 404 (bucket not allowlisted)
curl -sI "http://localhost:9633/storage/photos/../../etc/passwd"   # expect 400

# 2. R2 path — inline env vars only, NEVER written to .env.local
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  S3_REGION=auto \
  S3_ACCESS_KEY_ID=<r2-access-key-id> \
  S3_SECRET_ACCESS_KEY=<r2-secret-access-key> \
  S3_FORCE_PATH_STYLE=true \
  npm run dev
# a key present in R2   → x-asset-source: r2
# a key absent from R2  → x-asset-source: supabase + one [asset-proxy] fallback warn
```

**W4 — do not set `S3_*` in Coolify yet — resolved, see the concrete gate
below.** The `S3_*` vars (and `STORAGE_PROVIDER`) had to stay out of
Coolify until Phase 188 fixed the provider seam AND Phase 191 copied the
objects. Both are now true. See "Phase 191 — R2 migration, cutover, and
rollback" above, "Cutover" subsection, for the exact precondition
(`npm run migrate:r2 -- --verify-only` exiting 0 across all five buckets)
that must be re-checked immediately before wiring `S3_*` into Coolify —
this paragraph documents why the prohibition existed, not an open-ended
ban anymore.

**Not done in Phase 187:** no DB row rewritten, no `getPublicUrl()` change,
no component/PDF/share page repointed, no object copied into R2, no CDN
cache-HIT claim (PROXY-05 is Phase 192).

---

### URL-02 — row rewrite cutover and rollback (Phase 192)

Rewrites every persisted absolute `*.supabase.co` storage URL in the database
to the same-origin `/storage/{bucket}/{key}` path the Phase 187 proxy serves,
with a reversible record of every change.

Tool: `scripts/rewrite-asset-urls.ts`, aliased as `npm run rewrite:asset-urls`.
It is an OPERATIONAL step run BY HAND. CI never runs it and the deploy pipeline
never runs it. **Dry run is the default** — it plans and prints and writes
nothing; `--apply` is the only way to write, and every write mode refuses
without `--confirm-project <ref>` matching the project
`NEXT_PUBLIC_SUPABASE_URL` resolves to. **`.env.local` in this repo points at
PRODUCTION.**

#### 1. The migration is applied to production BY HAND, first

**This repo applies migrations to production manually. The deploy pipeline
(GitHub Actions → GHCR → Coolify) ships CODE ONLY and NEVER runs them.** Merging
`supabase/migrations/20260806000003_phase192_storage_url_rewrites.sql` does not
create `public.storage_url_rewrites` in production — a human does, through the
Supabase SQL editor or MCP, and then verifies the actual schema.

Do it before anything else. `--preflight` exits non-zero when the table is
absent, precisely so getting this backwards is a loud stop rather than a
confusing failure halfway through a run.

#### 2. The measured scope — 11 occurrences across 4 columns

Measured on **2026-08-06** by direct query against the production database, not
estimated. `--preflight` re-counts all of it live and prints each target next to
this baseline, so any divergence is visible without arithmetic.

| Target | Type | Occurrences holding a Supabase storage URL |
|---|---|---|
| `companies.logo_url` | text | **1** (of 1 non-null) |
| `platform_branding.logo_url` | text | **1** (of 1 non-null) |
| `platform_branding.og_image_url` | text | **1** (of 1 non-null) |
| `platform_branding.landing_content` | **jsonb** | **8**, all `.webp`, inside ONE 3,050-byte document |
| `clients.logo_url` | text | 0 (0 non-null rows) |
| `platform_branding.favicon_url` | text | 0 (null) |
| `blog_posts.cover_image_url` | text | 0 (0 non-null rows) |
| `auth.users.user_metadata` (`avatar_url`) | user_metadata | 0 (8 users have an avatar; all OAuth provider URLs) |
| **Total** | | **11** |

The four zero-count targets stay in the tool's target table for drift detection.
They report `0` and the run moves on.

**8 of the 11 live inside one JSONB document.** A text-columns-only rewrite would
miss 73% of the scope and leave the landing page — the exact surface PROXY-05 has
to prove — still pulling from `*.supabase.co`. The rewrite is **value-level**
(every URL leaf independently, key-agnostic); the **audit record is
document-level** (the whole document, old and new), so a restore is one exact
assignment and never a merge. Both are true.

#### 3. The exclusion — `company_price_book.image_url` is NOT a target

**293 non-null rows, ZERO Supabase URLs.** Every one is an external
`https://images.pexels.com/...` stock photo.

The trap: the requirement text names "price-book image URLs", so matching on the
**column name** rather than on the **Supabase storage URL prefix** would corrupt
293 rows of working data. Selection in the tool always runs the value through
`rewriteAssetUrl` from `lib/storage/url-rewrite.ts`, which only matches a Supabase
public storage URL for a persistable, non-exempt bucket. The exclusion, its
reason and its measured numbers live in `EXCLUDED_TARGETS` **in code**, and
`--preflight` re-counts the Supabase-URL figure live and **BLOCKS** if it is ever
non-zero.

#### 4. The video exemption — `hero-bg-videos/` stays absolute

Keys under `hero-bg-videos/` keep their absolute Supabase URL, mirroring the
Phase 190 writer exemption: the asset proxy is whole-object pass-through with no
Range/206 and no `Accept-Ranges`, and Safari (desktop + iOS) refuses to play a
`<video>` from an origin that does not honour byte-range requests.

**No background video is set in production today, so this exemption currently
matches nothing.** It is counted and printed as `EXEMPT_VIDEO=<n>` rather than
assumed. Every gate asserting "zero `*.supabase.co` references" must permit this
one documented exception while stating that it matches nothing right now.
**Prerequisite for lifting it: Range/206 support in the asset proxy.**

#### 5. Cutover

```bash
# 0. migration applied by hand first (Supabase SQL editor / MCP), then:
npm run rewrite:asset-urls -- --preflight --dump "<path-outside-the-repo>/pre-state.json"
npm run rewrite:asset-urls                       # dry run - writes nothing
npm run rewrite:asset-urls -- --apply --confirm-project <project-ref>
npm run rewrite:asset-urls                       # re-run: PLANNED_CHANGES=0
```

Every mode ends with machine-readable summary tokens on their own lines —
`CENSUS_TOTAL`, `PLANNED_CHANGES`, `APPLIED_CHANGES`, `BATCH_ID`,
`BATCH_REUSED`, `UNREVERTED_BATCHES`, `REVERTED`, `DRIFTED`,
`SKIPPED_UNSERVEABLE`, `EXEMPT_VIDEO`, `EXCLUDED_PRICE_BOOK_ROWS`,
`EXCLUDED_PRICE_BOOK_SUPABASE_URLS`, `PREFLIGHT_BLOCKERS`. Automated checks
assert against those, never against the prose around them.

Non-obvious behaviours worth knowing before you run it:

- `SKIPPED_UNSERVEABLE=<n>` above zero is a finding to investigate **before**
  applying — it means a stored key exists that the proxy would refuse to serve.
- **`--apply` REUSES an open (unreverted) batch instead of minting a second
  one.** A crash mid-apply followed by a re-run stays ONE batch. Two batches for
  one logical apply is exactly how `--revert-latest` ends up restoring half of
  production and still exiting 0.
- Every update is **compare-and-set** and asserts **exactly 1 row affected**:
  text targets filter on the prior column value, `platform_branding.landing_content`
  filters on the `updated_at` it was read with (a JSONB equality filter is not
  reliable through PostgREST). On 0 rows the run **deletes the audit row it just
  inserted and exits non-zero** — the audit table must never claim a change that
  did not happen. A concurrent admin save is therefore detected, not destroyed.
- `auth.users.user_metadata` has no compare-and-set through the Admin API. The
  tool re-reads the user immediately before writing and aborts if the metadata
  moved. The residual race cannot be closed through that API; it has **zero
  subjects in production today**.
- `--preflight` reports R2 object presence as a **WARN, never a pass** — it does
  not check R2 at all. The rewrite is still correct against an empty R2 because
  the proxy reads through to Supabase for anything missing. Use
  `npm run migrate:r2 -- --verify-only` for the R2 side.

#### 6. Rollback — one command

```bash
npm run rewrite:asset-urls -- --revert-latest --confirm-project <project-ref>
```

**The `--` is load-bearing.** Without it npm swallows `--revert-latest` as an npm
option instead of forwarding it to the script — the same trap
`npm run migrate:r2 -- --verify-only` documents — and an intended rollback
silently becomes a dry run that reports nothing wrong.

- It counts unreverted batches, prints `UNREVERTED_BATCHES`, and reverts **ALL**
  of them newest-first in one run. Partial rollback is the failure mode it exists
  to prevent.
- It **refuses drifted rows** (a row changed after the rewrite landed — a newer
  upload) and **exits non-zero** when anything drifted, so a partial rollback can
  never read as clean. `--force` also restores them and says so loudly; that is
  data loss if the newer value mattered.
- `--revert <batch-id>` stays available for surgical single-batch use and prints
  `UNREVERTED_BATCHES` so you can see what it is NOT reverting.
- `--restore-from-dump <path>` is the **independent second restore path** — it
  reads nothing from the audit table, which is the point: it works when the audit
  table itself is the thing that went wrong.

SQL equivalent for an operator with only the SQL editor (one statement per text
target; `platform_branding.landing_content` assigns `r.old_value` directly rather
than `#>> '{}'`):

```sql
update public.companies c
   set logo_url = r.old_value #>> '{}'
  from public.storage_url_rewrites r
 where r.target = 'companies.logo_url'
   and r.row_pk = c.id::text
   and r.reverted_at is null
   and r.batch_id = '<batch-id>';
```

`auth.users` metadata has **no SQL-only equivalent** — it must go through the
Admin API, i.e. through this script.

#### 7. The `--dump` pre-state file contains tenant data

It holds pre-rewrite copies of platform branding and tenant company rows. Write
it **outside the repo** and **never commit it**.

---

## Phase 191 — R2 migration, cutover, and rollback (authoritative)

This is the live procedure. Everything from "Why this is a 1-line change"
onward, below, is the Phase-66/Hetzner-era plan — superseded, kept only for
historical context, and marked as such at every heading. If you are about
to run a command from this document, it belongs above this line.

### Verified R2 settings

Placeholders only — real values live in the operator's scratchpad, never in
this repo, never in `.env.local`, never in Coolify (until the cutover step
below explicitly says otherwise).

| Setting | Value |
|---|---|
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | `<r2-access-key-id>` / `<r2-secret-access-key>` |
| Buckets | `audio`, `photos`, `pdfs`, `logos`, `platform-brand` — Standard, WEUR, public `r2.dev` access disabled |
| Credential | one Account API token, Object Read & Write, scoped to exactly those five |

`s3ConfigFromEnv()` (`lib/storage/s3-config.ts`) is the single mapping these
env var names go through — every script in this section (`r2-verify.ts`,
`r2-migrate.ts`) and the app itself (`lib/storage/server.ts`) read the same
function, so this doc and the running app cannot disagree about what
`S3_REGION` or `S3_FORCE_PATH_STYLE` mean.

### Preconditions

- `npm run verify:r2` exits 0 with the real credential supplied inline. A
  `SKIP` on the `public-access:*` lines is **not** a pass — it means the two
  `CLOUDFLARE_*` vars were omitted, so that leg was never checked. Re-assert
  it with a short-lived Cloudflare R2 read token whenever the bucket set
  changes.
- Objects may be copied at any time, in any order, **with no maintenance
  window and no write pause.** The asset proxy's Supabase read-through
  (`lib/storage/asset-source.ts`) serves anything not yet in R2, so a
  partially-copied R2 still serves every asset correctly. This replaces the
  Hetzner-era section's "pause writes before sync" step below, which is
  wrong for this migration.
- The object count is **not** a fixed number and must never be hard-coded
  anywhere that could go stale — see "Execution record" below for why.

### Migration

Copy-and-verify, env vars inline, never written to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=<from .env.local> \
  SUPABASE_SECRET_KEY=<from .env.local> \
  S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  S3_REGION=auto \
  S3_ACCESS_KEY_ID=<r2-access-key-id> \
  S3_SECRET_ACCESS_KEY=<r2-secret-access-key> \
  S3_FORCE_PATH_STYLE=true \
  npm run migrate:r2
```

Report row vocabulary, verbatim from `formatMigrationReport` in
`scripts/r2-migrate.ts` (see `191-02-SUMMARY.md` for the full derivation):

- `[MATCH]` — source and destination already agree on size + content type.
  No write.
- `[COPIED]` — written this run, and the post-write re-read confirmed it
  landed correctly. Never emitted in `--verify-only`.
- `[WARN]` — `unknown-source-content-type`: the source object never
  recorded a content type AND the destination's content type is the
  generic `application/octet-stream` fallback. Not fatal.
- `[EXTRA]` — a destination key with no source counterpart. **Not fatal** —
  this is the W1 rollback signal: it means an object exists in R2 with no
  Supabase counterpart, so a rollback for that specific object now needs a
  copy-back (see "Rollback" below).
- `[FAIL]` — `missing` / `size-mismatch` / `content-type-mismatch`, or a
  write whose post-copy re-read does not match. Any `[FAIL]` row flips the
  process exit code to `1`.

Each bucket line renders `<bucket>: source=<n> destination=<n>`, and the run
ends with a summary line
(`objects=<n> match=<n> copied=<n> warn=<n> extra=<n> FAIL=<n>`) followed by
`ALL OBJECTS VERIFIED` or `ONE OR MORE OBJECTS FAILED VERIFICATION`. **Exit
code is 0 only when the row set contains zero `[FAIL]` rows.** The run is
restartable by simply invoking the same command again — nothing is ever
deleted, and an unconditional-overwrite copy makes a second pass
self-healing for anything that changed in between.

### Re-run / verify without writing

Same env block, with `-- --verify-only`:

```bash
... npm run migrate:r2 -- --verify-only
```

The `--` is **load-bearing**: `npm run migrate:r2 --verify-only` (no `--`)
silently swallows the flag as an npm option and runs a full **write** pass
instead of the read-only check you asked for.

Running the plain command twice, back to back, proves idempotency (MIG-01):
the second run reports `copied=0` with every row `[MATCH]`. Running
`--verify-only` against a destination with a corrupted or deleted object
proves the opposite property (MIG-02): it reports `[FAIL]` naming the key
and exits non-zero **without** healing it — `copyObject` is never called in
this mode, by construction (see `scripts/r2-migrate.ts`'s own docblock).

### Cutover

This is the part that lifts the standing "do not set `S3_*` in Coolify"
prohibition that appears twice elsewhere in this document.

1. **Hard gate:** `npm run migrate:r2 -- --verify-only` exits 0 across all
   five buckets, run immediately before the Coolify change (not from a
   stale earlier run).
2. Only then may `S3_*` be set in Coolify. The prohibition existed for two
   independent reasons, and **both** had to be fixed before it could lift:
   Phase 188 fixing the provider seam (`serverStorageBackend()` — see
   below), and this phase actually copying the objects into R2. Neither
   alone was sufficient.
3. Coolify env changes need a redeploy/recreate to take effect. After that
   redeploy, the post-deploy Inngest re-sync step in
   `.github/workflows/build-deploy.yml` must run — do not skip it; a missed
   sync silently stops every event-triggered Inngest job.
4. Setting `S3_*` alone changes which backend serves the proxy — nothing
   else. Repointing existing DB rows (`getPublicUrl()` output,
   `companies.logo_url`, etc.) and proving the Cloudflare cache HIT is
   **Phase 192**, not this one.
5. Smoke checks after the flip: `/api/health` reports `storage: 'ok'`; one
   estimate created with audio + a photo; a PDF send; a public share page
   rendering the company logo; `X-Asset-Source: r2` on a `platform-brand`
   key. The header is edge-cached on public buckets, so treat it as a
   convenience only — the authoritative signal is the server-side
   `[asset-proxy] fallback` warn line in `lib/storage/asset-source.ts`, not
   the header (see "Fallback observability" above).

### Rollback

Two cases, both concrete. In both, **never delete a Supabase bucket** as
part of a rollback or in the same window as a cutover — the 7-day rule in
the superseded "What to NEVER do" section below still holds.

**Before any write reaches R2** (today's state, and the state through
Phase 187): remove the `S3_*` vars from Coolify, or set
`STORAGE_PROVIDER=supabase` — an explicit kill switch that wins even with a
complete `S3_*` config (`lib/storage/server.ts`'s own selection matrix).
Redeploy. Every read returns to Supabase with no code change and no data
movement, because nothing was ever deleted from Supabase.

**After writes have reached R2** (post-188/189, i.e. once server writes and
browser uploads are actually routing to R2): the same lever restores reads,
but any object written only to R2 is now unreachable through Supabase.
Recover it by copying back — the `[EXTRA]` rows from
`npm run migrate:r2 -- --verify-only` are exactly the list of those keys.
The current script copies Supabase→R2 only; a copy-back is a manual step
(or a follow-up script), not a flag. Do not claim a reverse mode exists.

### Execution record

Executed against live production R2 on 2026-08-06.

| Step | Result |
|---|---|
| Baseline `npm run verify:r2` | 16/16 PASS, zero SKIP — the public-access leg was re-asserted with a short-lived Cloudflare R2 admin token, which was revoked immediately afterward |
| Initial copy (`npm run migrate:r2`) | **55 copied, 0 failed** |
| Second run (idempotency, MIG-01) | 0 copied, 55 matched |
| `npm run migrate:r2 -- --verify-only` | zero writes, all 55 matched |
| Deliberate corruption drill (MIG-02) | one R2 object truncated to 9 bytes; the next verification run **detected it** — `[FAIL]` naming the object, reporting source size vs. destination size, non-zero exit |
| Restore | object re-copied, all green afterward |
| CORS | applied to the `audio` bucket (see "CORS on the `audio` bucket" above); the production app token cannot set bucket CORS itself (`PutBucketCorsCommand` → `AccessDenied`, verified) — this was an out-of-band admin step |

**The object count is a moving target, not a constant — do not hard-code
it.** It was 51 when this migration was scoped (2026-08-05) and 55 by the
time the copy actually ran (2026-08-06): a live user uploaded three audio
recordings and a logo during the same working session. The command compares
live source against live destination on every invocation, which is what
makes the number irrelevant to correctness. Objects created between the
copy and the eventual URL cutover (Phase 192) exist only in Supabase until
the copy is re-run — harmless, because the proxy falls back there, and
fixed by simply running `npm run migrate:r2` again.

Per-bucket source/destination counts were not individually transcribed into
this record beyond the totals above; the summary line and the `[FAIL]`
count are the load-bearing numbers, and the full per-object report is
reproducible on demand by re-running `npm run migrate:r2 -- --verify-only`.

**What this phase did NOT do:** no `S3_*` set in Coolify, no DB row
rewritten, no `getPublicUrl()` change, no CDN cache-HIT claim. Those are
Phase 192 — see "Cutover" above for the exact precondition that unblocks
that work.

---

## Phase 188 — server-wide provider selection integrity (2026-08-06)

PROV-01 fixed the seam; PROV-02 built the census gate that keeps it fixed.
This section is the durable record — see §1 of the field assessment above
for the bug this closed.

**Selection matrix, verbatim from `lib/storage/server.ts`'s own docblock
(one source of truth — if this table and that file ever disagree, that is
itself a finding worth filing):**

| `STORAGE_PROVIDER`     | `S3_*` complete? | Result                                                      |
|-------------------------|------------------|---------------------------------------------------------------|
| unset / unrecognized    | yes              | `'r2'`                                                        |
| unset / unrecognized    | no               | `'supabase'`                                                  |
| `'supabase'`             | yes              | `'supabase'` (explicit kill switch always wins)               |
| `'supabase'`             | no               | `'supabase'`                                                  |
| `'s3'`                   | yes              | `'r2'`                                                        |
| `'s3'`                   | no               | **throws**, naming the missing var(s) — never a silent fallback |

Only the exact strings `'s3'` and `'supabase'` are recognized values of
`STORAGE_PROVIDER`; anything else (unset, empty string, a typo) is treated
as unset and falls through to the `S3_*`-presence check.

**Reversibility — with the Phase 187 W1 caveat still standing.** Removing
the `S3_*` vars returns the entire server to Supabase with no code change
and no data movement — but that is unconditionally true ONLY while no
object exists solely in R2. That held through Phase 187. It stops holding
the moment Phase 188's `serverStorage()` writes are actually exercised
under R2 (i.e. once `S3_*` is set somewhere) and once Phase 189 sends
browser uploads there — from that point forward, rolling back also
requires copying the R2-only objects back to Supabase before flipping the
switch. Phase 188 makes the seam correct; it does not activate it (see
below), so this caveat is not yet live in production — but do not restate
the reversibility sentence without it once R2 is turned on.

**RLS delta.** `serverStorage(client)` in R2 mode ignores the passed
client's Supabase `storage.objects` RLS entirely — S3 has no per-user
policy layer of its own. In Supabase mode the passed client's RLS still
applies exactly as before. Every user-scoped server call site therefore
relies on its own app-level guard as the SOLE authorization gate once R2 is
active. All 10 user-scoped sites were audited during Phase 188 Plan 02 and
confirmed to have a genuine guard already in place:

| File | Function | Guard relied upon once R2 is active |
|---|---|---|
| `lib/actions/admin-company.ts` | `createAdminCompany` | `requireAdmin()` at the top of the action |
| `lib/actions/client.ts` | `uploadClientLogoAction` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/company.ts` | `uploadOnboardingLogoAction` | authenticated-user check (`supabase.auth.getUser()`) + `assertWritable()`; storage path scoped to `userData.user.id` |
| `lib/actions/photo.ts` | `uploadProjectPhoto` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/photo.ts` | `deletePhoto` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/price-book.ts` | `createPriceBookItem` | explicit `assertWritable()` call in the action body |
| `lib/actions/price-book.ts` | `updatePriceBookItem` | explicit `assertWritable()` call in the action body |
| `lib/actions/recording.ts` | `deleteRecording` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/settings.ts` | `updateCompanySettings` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/settings.ts` | `updateProfile` | explicit `assertWritable()` call in the action body |

3 additional service-role sites (`app/admin/branding/actions.ts`,
`app/admin/landing/actions.ts`, `app/admin/seo/actions.ts`) need no guard
table entry — the service-role client already bypasses RLS regardless of
backend.

**Still not activated.** `S3_*` credentials remain deliberately absent from
`.env.local` and Coolify. Phase 188 makes the seam correct; it does not
turn R2 on. Phase 191 copies objects into R2, Phase 192 cuts over reads and
proves the CDN cache-HIT claim. Setting `S3_*` in Coolify before Phase 191
still burns doomed presign-and-fetch round trips per landing visit — the
existing W4 note above stays true.

**What Phase 188 deliberately did NOT fix:**

- **Browser uploads still go straight to Supabase.** The 3 upload call
  sites (`capture-recorder.tsx`, `inline-audio-recorder.tsx`,
  `use-ai-input-submit.ts`) are unchanged — Phase 189 (UPLOAD-01/02)
  replaces them with server-issued presigned PUTs.
- **Browser reads still mint Supabase signed URLs.** The 4 read call sites
  (`photo-card.tsx`, `photo-lightbox.tsx`, `estimate-document.tsx`, and
  `capture-recorder.tsx`'s photo-restore path) are unchanged — Phase 190
  repoints them at the same-origin asset proxy. Until then, activating R2
  before Phase 190 ships would make a browser-side photo read miss (it
  would still resolve a Supabase signed URL for an object that may only
  exist in R2). This is a second, independent reason not to activate R2 in
  this phase.
- **The orphan-cleanup cron's folder walk does not match S3's flat
  listing.** `lib/storage/s3-provider.ts`'s `list()` calls
  `ListObjectsV2Command` without a `Delimiter`, so it returns keys
  recursively, while Supabase's `list()` returns one folder level at a
  time. `lib/inngest/functions/storage-orphan-cleanup.ts`'s 3-level
  folder-by-folder walk assumes the Supabase (non-recursive) shape, so
  under R2 the constructed prefixes diverge from any real key and real R2
  orphans likely never reach the age/delete path. **This is a functional
  gap (orphans go unswept), not a safety gap** — the age gate itself
  (`ageMsOf()`) is already fail-closed under an S3-shaped `ListedObject`
  (verified by a Phase 188 Plan 03 test), so nothing gets deleted wrongly;
  real orphans just accumulate uncollected in R2 post-cutover. Fixing this
  needs either an edit to `s3-provider.ts` (forbidden in Phase 188) or a
  walk-algorithm rewrite (an architectural change) — left for a future
  phase, documented in `storage-orphan-cleanup.ts`'s own header docblock.

**The census gate (PROV-02).** `tests/unit/storage/storage-seam-census.test.ts`
walks `app/`, `lib/`, `components/`, `hooks/` via the TypeScript AST,
enumerates every `createStorage`/`serverStorage`/`getServerStorage` call
site and every raw `.storage.from(...)` escape hatch mechanically (no
hand-maintained file list), and asserts exact-set equality against an
explicit manifest. A new server-side `createStorage(client)` call site, a
reintroduced raw Supabase escape hatch, or a client component importing
`@/lib/storage/server` each fail the suite — and therefore CI, and
therefore the deploy. Unlike the Phase-66 STORAGE-03 grep gate (which
stayed green the entire time the PROV-01 bug existed), this gate was
observed actually failing on all four of those cases before being
reverted — see the Phase 188 Plan 04 SUMMARY for the verbatim failure
output. Building this gate also surfaced two genuine PROV-01 gaps Plans
01-03 had missed — `lib/inngest/functions/analyze-photos.ts` and
`lib/inngest/functions/transcribe-audio.ts` were still calling raw
`supabase.storage.from(...).download(...)` directly — both were converted
to `serverStorage(supabase)` as part of closing Plan 04.

---

## Phase 189 — browser uploads without browser credentials (2026-08-06/07)

UPLOAD-01's negative half (no storage credential reaches the browser) and
UPLOAD-03 (content type survives the round trip, including for a key with no
extension) — plus the one prerequisite this milestone cannot verify from the
repo. gitleaks cannot match bare-hex credentials — they carry no
vendor-specific prefix the way a Stripe or webhook secret does, and an R2
account id/access key is exactly that bare-hex shape — so "the hook passed"
is not evidence of anything below; the Plan 04 verification checks the
shapes directly instead.

**1. What changed.** The three browser upload call sites —
`components/capture/capture-recorder.tsx`,
`components/projects/inline-audio-recorder.tsx`, and
`components/workspace/ai-input-group/use-ai-input-submit.ts` (all targeting
the `audio` bucket) — no longer hold a storage client of any kind. Each now
`POST`s to `/api/storage/upload-ticket` and receives a single-key,
single-use ticket:

```typescript
type UploadTicket =
  | { strategy: 's3-presigned-put'; bucket: string; key: string; url: string;
      headers: Record<string, string>; expiresInSeconds: number; contentType: string }
  | { strategy: 'supabase-signed-upload'; bucket: string; key: string; token: string;
      expiresInSeconds: number; contentType: string }
```

The browser then PUTs (R2) or `uploadToSignedUrl`s (Supabase) the bytes
against that ticket via `lib/storage/browser-upload.ts`'s `uploadViaTicket()`.
`ticket.headers` is sent **verbatim** — no merging, no extra header, no
`x-upsert` — because any unsigned or altered header breaks the presigned
signature. `ticket.contentType` re-stamps the Blob before the write (see
item 6 of the Phase 187 field notes and item 3 below): the key is derived
**server-side** from the caller's active company, so nothing in the request
body can choose a prefix — a request body carrying someone else's
`companyId` is read by nobody in the route.

**2. R2 CORS is a hard prerequisite for activation — and Supabase mode
hides it completely.**

> ⚠️ A presigned PUT to `https://<account-id>.r2.cloudflarestorage.com` is
> **cross-origin** from the app. Without a CORS policy on the `audio`
> bucket allowing `PUT` from the app origin, with `Content-Type` in
> `AllowedHeaders`, the preflight fails and **every browser audio upload
> dies at cutover** — while every test and every Supabase-mode run stays
> green, because Supabase Storage is the origin the app already talks to.
> This is the single most likely way this milestone breaks in production,
> and no automated check in this repo can catch it — see CONTEXT.md
> (Phase 189) for the verified detail that the production app token
> **cannot** set bucket CORS itself (`PutBucketCorsCommand` returns
> `AccessDenied` — correct least-privilege behavior, not a bug), so this is
> an out-of-band admin step with zero repo-side evidence.
>
> Intended policy for the `audio` bucket, to apply at cutover:
>
> - AllowedOrigins: the production app origin(s) and any preview origin
>   that must upload
> - AllowedMethods: `PUT`, `GET`, `HEAD`
> - AllowedHeaders: `content-type`
> - **ExposeHeaders: `etag`** — required, not optional:
>   `lib/storage/upload-with-retry.ts` treats a 409 as success and reads the
>   response `ETag` to confirm the object actually landed; without
>   `ExposeHeaders`, the browser's `fetch` cannot read that header
>   cross-origin and a legitimate retry-confirmed success looks like a
>   failure.
> - MaxAgeSeconds: a short value (e.g. 3600) is sufficient
>
> **Whoever runs the Phase 191/192 cutover must apply this BEFORE flipping
> `S3_*` into Coolify** — add it to that cutover checklist explicitly, not
> as an assumed side effect of provisioning. Confirm the same policy is
> **not** needed on `photos`, `pdfs`, `logos`, or `platform-brand` — no
> browser writes to those four; all are written server-side.

**3. The tenant-confinement contract.** Every ticketed key is
`{companyId}/{projectId}/{uuid}.{ext}` — `companyId` comes from
`getActiveCompanyId()` (never the request body), project ownership is
verified against that company under the RLS-bound request client before a
ticket is ever minted, and a client-supplied prior `key` (the retry path) is
**re-validated, never repaired** — a key that fails tenant-confinement
validation gets a hard refusal, not a "corrected" key. This is what replaces
Supabase's `storage.objects` RLS, which — per `lib/storage/server.ts`'s own
header docblock — **"DROPS Supabase `storage.objects` RLS in R2 mode,
because an S3-compatible backend has no per-user policy layer of its own."**
In R2 mode, the ticket-minting route's own gates (auth, active company, demo
guard, project ownership) are the *entire* authorization surface for where a
browser upload can land — there is no storage-layer backstop underneath them
the way there is in Supabase mode today.

**4. Resilience preserved.** `lib/storage/upload-with-retry.ts` is
byte-unchanged and still wraps the byte move: 3 attempts, 1s/2s backoff,
409-as-success, terminal-4xx-is-terminal. The ticket is minted **once**,
outside that retry loop, so every retry attempt reuses the same key — minting
a fresh ticket per attempt would break the wrapper's 409-as-success rule and
orphan a new object on every transient failure. The capture flow's IndexedDB
resume is unchanged. `inline-audio-recorder.tsx` and
`use-ai-input-submit.ts` **gained** the 3-attempt retry ladder they did not
have before this phase — a strict improvement, not a behavior change to
guard against.

**5. What Phase 189 did NOT fix.** Browser *readers* still mint Supabase
signed URLs directly: `photo-card.tsx`, `photo-lightbox.tsx`,
`estimate-document.tsx`, and `capture-recorder.tsx`'s photo-restore effect.
With R2 active and Phase 190 not yet landed, a browser-side photo read
misses (it resolves a Supabase signed URL for an object that may only exist
in R2). This is an independent reason not to activate R2 before Phase 190
ships, and it **compounds** — rather than duplicates — the same-shaped gap
Phase 188 already recorded for server-side reads; see "What Phase 188
deliberately did NOT fix" above.

**6. Known limitation: no server-side size cap on the presigned PUT.** An
S3 presigned PUT cannot enforce a maximum object size — only a presigned
POST policy can do that, and this phase deliberately did not switch to POST
policies (a bigger change, out of scope here). In Supabase mode the
bucket's own file-size limit still applies underneath the ticket; in R2
mode it does not. The exposure is bounded — a ticket is issued only to an
authenticated, non-demo member of the company, for exactly one key, for 15
minutes — but it is a real behavioral difference between the two backends
and belongs written down rather than left implicit.

---

## Phase 190 — portable same-origin asset URLs (URL-01, URL-03, URL-04)

**Completed 2026-08-06.** Four plans. The one-sentence version: *newly written
asset URLs no longer contain a storage hostname at all — they are
`/storage/{bucket}/{key}` paths served by the Phase 187 proxy, and each rendering
surface resolves that path with the mechanism appropriate to it.*

### 1. The persisted URL form

Every newly persisted asset URL is a bare same-origin path:

```
/storage/{bucket}/{key}
```

It is built in exactly ONE place — `storageProxyPath(bucket, key)` in
`lib/storage/asset-url.ts` — which validates the key against the route's own
`normalizeProxyKey` before emitting, so an emitted URL is provably servable. It
throws rather than repairing or returning `''`: a persisted unservable URL is a
permanently dead image.

Only three buckets may be persisted this way (`PERSISTABLE_PROXY_BUCKETS`):
`logos`, `platform-brand`, `photos`. `audio` and `pdfs` are refused at the type
level AND at runtime — nothing persists a URL for them; they are delivered as
signed URLs at send time.

The 15 writer call sites, with the bucket each writes and whether it was
repointed:

| # | File:line | Bucket | Repointed? |
| --- | --- | --- | --- |
| 1 | `lib/actions/settings.ts:95` (company logo) | `logos` | yes |
| 2 | `lib/actions/settings.ts:476` (user avatar) | `logos` | yes |
| 3 | `lib/actions/company.ts:106` (onboarding logo) | `logos` | yes |
| 4 | `lib/actions/client.ts:136` (client logo) | `logos` | yes |
| 5 | `lib/actions/admin-company.ts:93` (admin-created company logo) | `logos` | yes |
| 6 | `lib/actions/price-book.ts:261` (price-book item image) | `photos` | yes |
| 7 | `lib/actions/price-book.ts:340` (price-book item image, update) | `photos` | yes |
| 8 | `app/admin/branding/actions.ts:61` (platform logo) | `platform-brand` | yes |
| 9 | `app/admin/branding/actions.ts:84` (platform favicon) | `platform-brand` | yes |
| 10 | `app/admin/landing/actions.ts:91` (hero image) | `platform-brand` | yes |
| 11 | `app/admin/landing/actions.ts:143` (how-it-works step image) | `platform-brand` | yes |
| 12 | `app/admin/landing/actions.ts:249` (feature image) | `platform-brand` | yes |
| 13 | `app/admin/landing/actions.ts:302` (hero background IMAGE) | `platform-brand` | yes |
| 14 | `app/admin/seo/actions.ts:78` (OG image) | `platform-brand` | yes |
| 15 | `app/admin/landing/actions.ts:202` (hero background **VIDEO**) | `platform-brand` | **NO — see §2** |

Side effect worth naming: sites 6 and 7 were previously calling `getPublicUrl()`
on the **private** `photos` bucket, which produces a public-object URL that
`400`s. Price-book thumbnails had been silently broken; they now resolve through
the proxy's `canReadPrivateKey` gate.

A repo-wide static gate (`tests/unit/storage/persisted-url-form.test.ts`) scans
the `.getPublicUrl(` **call shape** and fails on any new writer that mints a
storage-backend URL. It allowlists exactly one occurrence, in the landing action,
bound to `newBgVideoUrl`.

### 2. Consequence: video is the one asset class that stays on Supabase egress

The landing hero **background video** (`platform-brand/hero-bg-videos/…`) still
emits an absolute Supabase URL, and this is not a footnote — it is a standing
architectural consequence:

- The Phase 187 asset proxy is **whole-object pass-through**: no `Range`/`206`,
  no `Accept-Ranges`.
- Safari (desktop **and** iOS) refuses to play a `<video>` served from an origin
  that does not honour byte-range requests.
- Hero background videos are up to 20 MB and are not transcoded.

**Therefore: video does not move to the same-origin path, and does not get the
Cloudflare same-origin caching the rest of the assets now get.** It remains on
Supabase egress.

- **Current blast radius:** latent, not active — no hero background video is set
  in production today.
- **Named prerequisite before it can ever be repointed:** the asset proxy must
  support **`Range`/`206` + `Accept-Ranges`**. Until then, repointing it makes
  `tests/unit/admin/save-landing-asset-urls.test.ts` go red, deliberately.
- **CSP consequence:** `https://*.supabase.co` must stay in the CSP `media-src`
  directive for as long as this holds. **Phase 192 must not drop it** when it
  narrows `img-src`. This is pinned by
  `tests/unit/security/csp-same-origin-assets.test.ts`.

### 3. Three resolution mechanisms, and why they are deliberately different

A single persisted path is resolved three different ways, because the consumers
have genuinely different constraints. Do not "unify" them.

| Consumer | Mechanism | Why |
| --- | --- | --- |
| Browser surfaces (app UI, share pages) | uses the relative path as-is | the browser has the origin already; the proxy sets the cache policy |
| Origin-less server renderers (estimate PDF, `app/icon.tsx`, `app/apple-icon.tsx`) | in-process byte read → `data:` URI, via `lib/storage/asset-inline.ts` | a relative specifier has no base URL in Node; the platform HTTP client throws "Failed to parse URL" |
| Email + schema.org JSON-LD | absolutized against `getCanonicalBaseUrl()`, via `absoluteAssetUrl()` | a mail client and a rich-results crawler have no app origin at all and will not resolve a relative `src`/`url` |

Two details that are easy to get wrong:

- **The two `next/image` company-logo sites carry `unoptimized`**
  (`components/share/estimate-document-modern.tsx`,
  `components/workspace/estimate/estimate-document.tsx`). Without it, a relative
  src becomes `/_next/image?url=%2Fstorage%2Flogos%2F…` — the self-hosted
  optimizer fetches the proxy server-side and re-caches the result under
  `next.config.ts`'s `minimumCacheTTL: 2678400` (**31 days**), pinning a stale
  logo and neutralising the proxy's deliberate
  `max-age=300, stale-while-revalidate` policy for `logos` (which use STABLE keys
  with upsert and therefore MUST revalidate). The landing components already skip
  the optimizer for a second reason: it intermittently fails without `sharp`.
- **The PDF does NOT absolutize and fetch its own domain.** That would make the
  container request its own public hostname — out through Cloudflare and back in
  through Traefik. This repo has already been bitten in exactly that path (the
  Flexible-SSL HTTP→HTTPS redirect loop), and `getCanonicalBaseUrl()` on a dev box
  falls back to the production domain, so a local render would silently pull
  production assets. Reading the object in-process removes the origin from the
  problem and cannot leak a credential, because no URL is ever emitted. The
  inliner is restricted to an allowlist of raster image content types
  (`image/png`, `image/jpeg`, `image/webp`, `image/gif`) — that allowlist is a
  **logging-safety control**: `@react-pdf/image` interpolates the WHOLE data URI
  into its error message when the media type is not `image/<letters>`, which would
  print multi-megabyte base64 blobs into container logs and Sentry breadcrumbs.

### 4. Both Phase 187 deferred exclusions are now CLOSED — neither by widening the proxy

Phase 187's `lib/storage/proxy-auth.ts` recorded two deliberate exclusions and
handed their design to Phase 190. Both are closed, and it matters *how*:

- **"No share-token path" — CLOSED BY CONSTRAINT.** The proxy gained no token
  path and no anonymous private read. Instead, `PERSISTABLE_PROXY_BUCKETS` is
  restricted to buckets that are either publicly readable through the proxy
  (`logos`, `platform-brand` — which is exactly why an anonymous share-page
  visitor and a mail client resolve them with no session and no token), or never
  rendered anonymously (`photos`, whose only persisted URL is
  `company_price_book.image_url`, rendered solely on authenticated app surfaces).
  **Tenant job-site photos on share pages and in PDFs still resolve through
  short-lived, server-side-generated signed URLs** (`lib/queries/share.ts`,
  `lib/pdf/render-estimate-pdf.ts`) — that path is unchanged by this phase.
  This is asserted executably in
  `tests/unit/storage/anonymous-surface-invariant.test.ts`: adding a bucket to
  `PERSISTABLE_PROXY_BUCKETS` that is neither publicly readable nor documented
  as authenticated-only (with surface file paths that must exist on disk) fails
  the suite.
- **"No server-side-renderer path" — CLOSED BY IN-PROCESS READS.** The PDF
  renderer and the icon routes never authenticate against the route at all; they
  read the object bytes directly through the same R2-first/Supabase-fallback
  reader the route uses. No renderer credential, no service token, no widening.
- **"No platform-admin bypass"** — still **NOT built**, and still not needed. An
  admin cannot pull another company's private object through this route.

### 5. What is still NOT done

- **Existing rows are untouched.** No backfill, no migration, no rewrite. Rows
  written before this phase still hold absolute `*.supabase.co` URLs and still
  render — every resolver passes an absolute input through byte-identically.
  Rewriting them is **URL-02, Phase 192**.
- **The CSP is not yet narrowed.** `https://*.supabase.co` / `*.supabase.in` stay
  in `img-src` until the rows are rewritten (Phase 192), and
  `https://*.supabase.co` stays in `media-src` indefinitely (§2).
- **PROXY-05 — the CDN cache-HIT proof** (an actual `cf-cache-status: HIT` against
  the proxy) is still Phase 192.

### 6. Follow-ups this phase opened

- **PDF-LOGO-01 — company logos have never rendered in an estimate PDF.** All
  four `logos` writers run `convertImageToWebp`, and `@react-pdf/image` decodes
  only jpg/jpeg/png (on both the remote-URL and the data-URI path), while
  `lib/pdf/measure-header-height.ts` still reserves 64pt (modern) / 72pt
  (classic) purely on `company.logo_url` being truthy. Every estimate PDF for a
  company with a logo therefore has a blank reserved block. **This predates
  Phase 190 and is unchanged by it** — an absolute URL, a relative path and a
  data URI are all equally truthy. The fix means changing what those four
  writers upload (PNG, or dual-writing a PNG alongside the WebP) and needs its
  own migration story for existing rows.
- **Asset-proxy `Range`/`206` support** — the named prerequisite for §2's video.
- **`logos` could become `immutable`** once its writers move to versioned keys
  instead of the stable `{companyId}/logo.webp` + upsert. Already tracked in
  `lib/storage/proxy-policy.ts`.

---

## Why this is a 1-line change

> **Superseded** — see §1 of the field assessment above, and see "Phase 188
> — server-wide provider selection integrity" above for what the actual
> change was. Kept for context on what Phase 66 intended.

Phase 66 introduced `lib/storage/` — every storage call site in the app routes through the `StorageProvider` interface. There is no direct `supabase.storage.from(...)` call left in `app/`, `lib/`, or `components/` (verified by the STORAGE-03 grep gate).

Switching providers means **flipping `STORAGE_PROVIDER=s3`** and supplying the `S3_*` env vars. **No application code changes. No call site changes. No deployment of a new build is even strictly required** — the lazy `require('./s3-provider')` inside `getServerStorage()` picks up the new env on the next cold start (or on `docker compose up -d --force-recreate` for the VPS host).

---

## When to trigger

- **Hard trigger:** Supabase Storage usage hits 800 MB (check via Supabase dashboard → Storage → Usage)
- **Soft trigger:** Egress costs become noticeable on the monthly Supabase bill
- **Strategic trigger:** Moving to Hetzner Cloud VPS (Phase 68 deploy artifacts) — co-locate storage with compute for zero-cost intra-region traffic

---

## Pre-migration checklist

> **Superseded** — the live procedure is "Phase 191 — R2 migration,
> cutover, and rollback" above. Kept for context on what Phase 66 intended.

- [ ] Storage usage measured and recorded (per bucket, total)
- [ ] All five buckets enumerated: **`audio`**, **`photos`**, **`pdfs`**, **`logos`**, **`platform-brand`**
- [ ] Maintenance window scheduled (writes paused during sync — typical 30–60 min depending on size)
- [ ] Hetzner account in good standing
- [ ] Daily Supabase backup confirmed taken (Phase 61 baseline runbook)
- [ ] `aws-cli` v2 installed locally — `brew install awscli` / `apt install awscli` / Windows installer
- [ ] `scripts/storage-smoke.ts` executed against the destination (Hetzner) BEFORE the cutover — proves credentials + endpoint shape are correct

---

## Step 1 — Provision Hetzner Object Storage

> **Superseded** — the live procedure is "Phase 191 — R2 migration,
> cutover, and rollback" above. Kept for context on what Phase 66 intended.

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

> **Superseded** — the live procedure is "Phase 191 — R2 migration,
> cutover, and rollback" above. Kept for context on what Phase 66 intended.

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

> **Superseded** — the live procedure is "Phase 191 — R2 migration,
> cutover, and rollback" above. Kept for context on what Phase 66 intended.

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

> **Superseded** — the live procedure is "Phase 191 — R2 migration,
> cutover, and rollback" above. Kept for context on what Phase 66 intended.

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

> **Superseded** — the live procedure is "Phase 191 — R2 migration,
> cutover, and rollback" above. Kept for context on what Phase 66 intended.
> The steps below instruct an `aws s3 sync` against a Hetzner endpoint that
> does not exist — do not follow them.

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
