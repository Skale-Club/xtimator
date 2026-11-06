---
id: SEED-058
status: audit + execution plan, measured 2026-11-06
planted: 2026-11-06
planted_during: SEED-055 rollout (no active milestone)
trigger_when: With SEED-056/057 (same program). Owner reported "local is very slow" on 2026-11-06.
scope: Medium (local dev fixes are small; the prod DB-region move is the big one)
related: SEED-056, SEED-057
---

# SEED-058 — Speed audit: local dev and production

## 0. Summary of findings

| Where | Finding | Measured |
|---|---|---|
| Local | The running dev server (PID 38208, started 10:40) holds **9.9 GB RSS** and `.next/dev/cache` (Turbopack filesystem cache) has grown to **9.57 GB**. A dev process this size spends its time in GC and the cache is far past useful. | `Get-Process`, folder sizes |
| Local | `npm run dev` deletes `.next` on every start (`rimraf .next`), then starts `npx inngest-cli@latest` (network fetch each time). Every start is a cold compile of a 986-file app (219 pages/layouts, 313 components, 454 lib files). | `package.json:6` |
| Local | First hit of a route compiles it on demand (landing: 608 ms TTFB cold, 65 ms warm). The machine is not the bottleneck: i9-12900KF, 32 GB, NVMe. | curl |
| Local | Sentry server + client tracing at `tracesSampleRate 1.0` in dev, Langfuse keys set in `.env.local`, Inngest dev worker: every request and every AI call ships telemetry while you work. | `instrumentation.ts:60`, `instrumentation-client.ts:14`, `.env.local` |
| Local | `/api/health` takes 0.9–1.8 s even warm because it lists a storage bucket on every call. Harmless, but it is the one route a monitor hits constantly. | curl |
| Prod | **Server and database are on different continents.** App: Hetzner Falkenstein (Germany, `188.245.112.3`). Supabase `prmqgcrnpuvpzruyzvuv`: US East (22–40 ms from Cambridge, MA). Every query from the server pays ~90–110 ms. | ip-api, curl |
| Prod | Landing `/` TTFB **1.6–2.2 s** (`force-dynamic`, proxy `getClaims`, branding). `/api/health` 1.8 s. `/api/health/live` (no DB) 195 ms, so ~1.4 s of each page is server work dominated by DB round trips. | curl `-w` |
| Prod | Authenticated pages are serial on the server: app layout = 2 serial + 7 parallel queries; project page = ~6 serial awaits (`getProjectById` → entitlements → WhatsApp status → `getCurrentEstimate` → invoices → price book). At ~100 ms each this is 0.8–1.2 s before the page streams. | `app/(app)/layout.tsx`, `app/(app)/projects/[id]/page.tsx` |
| Prod | The AI pipeline pays the same hop on every Inngest step and journal write: generate_estimate median 29.9 s, max 280 s (2026-08-06 evidence). Drafting (the model call, ~75 s typical) dominates; pricing ~25 s. | `generation-phases.ts`, `generate-estimate.ts` job |

**Conclusion.** Local slowness is a dev-environment problem (cache/process
bloat, telemetry on, cold compiles), not an app problem, and does not
reproduce in production. Production has its own, structural latency: the
DB-region mismatch plus serial query chains. The two are fixed separately.

## 1. Local dev (do first; one afternoon)

1. **Reset and cap the Turbopack cache.** Stop the dev server, delete
   `.next/dev/cache`, restart. Add a `dev:clean` script that only purges the
   cache when it exceeds ~2 GB (a 10-line node script), and stop purging
   `.next` wholesale in `dev` (the persistent cache is what makes the second
   start fast). Verify the Next 16 option for disabling the dev filesystem
   cache before relying on it; document the choice in `package.json`.
2. **Turn telemetry off in dev by default.** `tracesSampleRate: 0` unless
   `SENTRY_DEV_TRACES=1`; Session Replay off in dev; Langfuse processor
   no-op unless `LANGFUSE_DEV=1`. Keep error capture.
3. **Stop fetching `inngest-cli@latest` on every start**: pin it as a
   devDependency and run the local binary.
4. **Restart cadence**: a dev process over ~4 GB RSS is slower than a fresh
   one; add the RSS to the `dev` banner (or a `/api/health` dev field) so it
   is visible.
5. **Warm the routes you use**: a `dev:warm` script that curls the 6 main
   routes after start so the first click is not a cold compile.
6. **Health route**: skip the storage probe when `?quick=1` (what the dev
   monitor should use); keep the full probe for Docker/Coolify.

Expected: cold start ~10 s, first navigation < 1 s, warm navigations
< 200 ms, process < 2 GB after an hour.

## 2. Production (the real latency)

### 2.1 Move the data next to the app, or the app next to the data (decision P1)

Options, in order of preference:

- **P1-a: new Coolify host at Hetzner Ashburn (US East)**, same image, same
  pipeline; Supabase stays. Expected: ~100 ms → ~5 ms per query, page TTFB
  from 1.6 s to ~0.4 s, AI pipeline journal/DB overhead −2–4 s per run.
  Cost: one server, one migration afternoon, DNS/Cloudflare switch,
  re-point Inngest serve URL (the post-deploy sync already handles it).
- P1-b: migrate the Supabase project to a EU region. Riskier (storage
  objects, auth users, signed URLs, the manual-migration workflow) and the
  customers are in the US anyway.
- P1-c: keep both and add a read replica. Not worth it at this size.

### 2.2 Cut serial round trips (independent of P1)

| Page | Today | Change |
|---|---|---|
| App layout | `getAuthClaims` → `getActiveCompany` (cookie validation + company) → 7 parallel | Validate the cookie and load the company in one RPC (`get_active_company(user_id, cookie_company_id)`); fold `platform_admins`, `credit_balance`, `getCycleGrantedCredits` and `getPaywallContext` into that same RPC. 3 round trips → 1. |
| Project page | 6 serial awaits | Start `getCurrentEstimate`, invoices, price book, entitlements and WhatsApp status in one `Promise.all` after `getProjectById`; or one RPC `get_project_workspace(project_id)`. |
| Dashboard | layout + stats (4 parallel counts) + projects (unbounded list) | One RPC for the four counts; paginate the project list server-side (the client-side filter can keep working on the first page + a "load more"). |
| Landing | `force-dynamic` + branding fetch on every hit | `revalidate = 300` with on-demand revalidation from the admin branding save (`updateTag('branding')` already exists); the proxy's `getClaims` on `/` can be skipped when no auth cookie is present. |
| `/api/health` | DB + storage list every probe | Keep for Coolify; add `/api/health/ready` that only does the DB probe for uptime monitors. |

### 2.3 AI pipeline wall clock (ties to SEED-057)

- Drafting is ~75 s because the model writes the whole estimate in one
  8k-token call. SEED-057 Phase C's plan step + a shorter, more
  deterministic price step is expected to be net neutral or faster; it is
  measured by the live eval before it ships.
- Stream the draft into the editor as it is produced (the stream already
  exists for the progress checklist): the owner sees sections appear
  instead of a spinner. Perceived latency −50%.
- Photo analysis: run the per-photo vision steps with concurrency 4 (today
  bounded but sequential-leaning); cap at 8 photos per estimate for the
  estimator prompt (the rest stay attached).
- Price research: skip the provider call when the company history (SEED-057
  Phase E) already covers ≥ 80% of the candidates.

## 3. Measurement before and after

- Local: cold start time, first-navigation time for the 6 main routes, RSS
  after 1 h (`scripts/dev-bench.mjs`, prints a table).
- Prod: `curl -w` TTFB for `/`, `/dashboard` (with a session cookie),
  `/projects/<id>` from a US client, p50/p95 over 20 hits; journal medians
  per generate phase from `pipeline_events` (already collected) before and
  after P1.
- Targets: landing TTFB < 400 ms; authenticated page TTFB < 600 ms; project
  page < 800 ms; generate_estimate p50 < 45 s, p95 < 120 s.

## 4. Decisions for the owner

| # | Decision | Proposed |
|---|---|---|
| P1 | Close the server↔DB region gap | **P1-a**: second Coolify host in Hetzner Ashburn, cut over behind Cloudflare, keep Falkenstein for one week as rollback. |
| P2 | Dev telemetry default | Off unless opted in. |
| P3 | Landing page caching | ISR 5 min + on-demand revalidation. |

## 5. What was NOT measured

- Authenticated page timings on the local dev server (needs a logged-in
  session; the numbers above are from the dev log, curl of public routes
  and code reading). The `dev-bench` script in §3 closes this.
- Server→Supabase RTT from inside the Hetzner host (inferred from the
  `/api/health` vs `/api/health/live` gap and geolocation; confirm with one
  `curl` from the container before P1).
