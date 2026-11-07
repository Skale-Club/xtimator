# SEED-059 — Xtimator production database: Supabase → Coolify PostgreSQL

**Status:** planned 2026-11-06, not started. Owner expected this to be done already (it is done for Xpot and Xkedule); it is not done for Xtimator.
**Portfolio plan:** `xmail/docs/supabase-exit-plan.md` — Xtimator is Phase 5 ("deeper platform consumers"), status Pending.
**Target state (portfolio rule):** production data in self-managed PostgreSQL on the Coolify/Hetzner host; Supabase project `prmqgcrnpuvpzruyzvuv` becomes the **development** database (explicit `DEV_DATABASE_URL` + `DEV_SUPABASE_PROJECT_REF`, never a fallback to prod).

## 1. Verified facts (2026-11-06, read-only queries + repo)

| Item | State |
|---|---|
| Prod DB | Supabase `prmqgcrnpuvpzruyzvuv`, PostgreSQL 17.6, **33 MB**, 81 public tables, 34 public functions. The build's `vars.NEXT_PUBLIC_SUPABASE_URL` points here; real traffic today. Local `.env.local` points at the SAME DB (there is no dev DB today). |
| Identity | **Already off Supabase Auth** since 2026-11-05 (`NEXT_PUBLIC_AUTH_MODE=owned`, phone/Google, `xtimator_accounts`, owned sessions — `docs/AUTH-CUTOVER.md`). `auth.users` still holds 24 legacy rows. |
| Files | **Already on R2.** `storage.objects` has 0 rows; `lib/storage/*` routes to R2 (`STORAGE_PROVIDER=s3`). |
| Data transport | **Still the Supabase Data API (PostgREST)** — ~870 `supabase-js` `.from()` calls, 18 RPCs. Server user client and the **browser client** (`lib/auth/owned-browser.ts`, 17 browser call sites) send an app-signed HS256 data JWT (`issueDataToken`, `XTIMATOR_DATA_JWT_SECRET`) to `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1`. Service client uses `SUPABASE_SECRET_KEY` (`sb_secret_…`, a Supabase-gateway key format — **not a JWT**, so a self-hosted PostgREST will not accept it). |
| Authorization | **459 RLS policies** using `auth.uid()` / `auth.jwt()` and roles `anon` / `authenticated` / `service_role`. These are load-bearing tenancy guards — must be preserved, never disabled. |
| Extensions | `vector` (`knowledge_entries.embedding`), `pgcrypto`, `uuid-ossp`, `pg_cron`, `pg_stat_statements`, `supabase_vault`. |
| pg_cron jobs (5) | `cleanup-orphan-draft-projects` (daily), `purge-whatsapp-processed-messages` (6h), `purge-expired-whatsapp-sessions` (10 min), `expire-trials` (hourly, only nulls `tier_trial_ends_at`; obsolete after SEED-055), `trial-warning-emails` (`SELECT 1`, dead). |
| Realtime | `components/notifications/use-notifications.ts` subscribes to `postgres_changes`, but the `supabase_realtime` publication has **0 tables** — live updates are already a no-op in prod. |
| Migration ledger | `supabase_migrations.schema_migrations`, rows recorded by exact repo version. |

**Why Xtimator differs from Xkedule/Xpot:** those apps talk to Postgres directly (Drizzle + `pg`) with no RLS policies, so a dump/restore + `DATABASE_URL` swap was enough. Xtimator's whole data layer goes through PostgREST with RLS. A dump alone does not remove the PostgREST, `auth.uid()` or role dependencies (same warning as the portfolio plan).

## 2. Chosen architecture

Keep the app code's data contract (supabase-js + RLS) and replace only the server behind it:

- **Coolify PostgreSQL 17 with pgvector** (`pgvector/pgvector:pg17` image), internal only, same host/network as the app, daily backup to a private R2 bucket + one tested restore.
- **Self-hosted PostgREST** (official `postgrest/postgrest` image) on Coolify, `PGRST_JWT_SECRET = XTIMATOR_DATA_JWT_SECRET`, `PGRST_DB_ANON_ROLE=anon`, schemas `public`. Exposed through Coolify's proxy at a data host (e.g. `data.xtimator.com`) under the **`/rest/v1` prefix** (strip-prefix middleware) because supabase-js and the browser call `${url}/rest/v1/...`. The browser needs it publicly reachable (it calls the Data API directly today).
- **Supabase compatibility shim** on the target (a migration, applied to dev too so schemas stay identical): roles `anon`, `authenticated`, `service_role` (BYPASSRLS), `authenticator` (login, `NOINHERIT`, granted the three), schema `auth` with `auth.uid()`, `auth.jwt()`, `auth.role()` reading `current_setting('request.jwt.claims', true)` exactly like Supabase. Grants mirrored from prod (`pg_dump --schema-only` of grants).
- **Service key:** replace `SUPABASE_SECRET_KEY` usage in `lib/supabase/data-service.ts` with a long-lived service JWT `{ role: 'service_role' }` signed with the same secret (new env `XTIMATOR_DATA_SERVICE_JWT`, stored the same way other secrets are — never committed). Works against both Supabase (dev; legacy JWT secret path must be checked) and self-hosted PostgREST.
- **pg_cron → Inngest:** move the 3 live jobs to Inngest crons (`lib/inngest/functions/`), drop `expire-trials` and `trial-warning-emails`.
- **Realtime:** replace the no-op `postgres_changes` subscription with bounded polling (or SSE) on the notifications bell — it already does not deliver live updates.
- **Not copied:** `auth` (Supabase GoTrue tables), `storage`, `realtime`, `vault`, `supabase_functions`, `graphql`, `pgsodium`, event triggers (`pgrst_*`, `issue_*`). Copied: `public` + `supabase_migrations`.
- **Dev:** Supabase `prmqgcrnpuvpzruyzvuv` becomes dev after cutover; add the explicit dev-target guard (Xpot's `DEV_DATABASE_URL` / `DEV_SUPABASE_PROJECT_REF` pattern) so `npm run dev` can never point at prod again.

## 3. Execution plan

Each step is its own reviewable increment; the code steps ship with the app still on Supabase (inert until cutover).

1. **Code prep (no behaviour change on Supabase):** service JWT in `data-service.ts`; pg_cron jobs as Inngest crons (keep the pg_cron jobs until cutover, idempotent overlap is safe); notifications polling; `NEXT_PUBLIC_SUPABASE_URL` stays the single data URL (cutover = env swap). Tests + CI.
2. **Compatibility shim migration** (roles, `auth.uid/jwt/role`, grants) — written so it is a no-op on Supabase (objects already exist) and creates them on vanilla Postgres.
3. **Provision on Coolify:** Postgres (pgvector) + PostgREST + domain/route `/rest/v1`; R2 backup bucket; host headroom check (RAM/disk) first.
4. **Rehearsal copy:** `pg_dump` (17) of `public` + `supabase_migrations` → restore → apply shim → row counts, sequences, constraints, policies, functions compared table by table (exact match is the gate). Point a **staging** deployment (or a local run with the env swapped) at the self-hosted PostgREST and run the full journey: owned login, dashboard, estimate create/edit/send, public estimate link, signatures, Stripe webhook, WhatsApp, MCP, chat, credit lots RPCs. Fix gaps.
5. **Cutover (~10–15 min downtime, quiet window ~06:00 UTC):** stop the app in Coolify → final copy + verify → set `NEXT_PUBLIC_SUPABASE_URL` (build var + runtime) and data keys to the self-hosted endpoint → redeploy (the URL is a build-time `NEXT_PUBLIC_*` var, so this needs a rebuild via the GitHub Actions var) → smoke tests → confirm Supabase `public` receives zero writes.
6. **Rollback window:** revert the env vars to Supabase; the Supabase copy stays frozen and intact.
7. **After:** Supabase becomes dev (dev guard on), archive the frozen prod copy after 7 days, update `CLAUDE.md` / memories (`project_supabase_mcp_mapping` is then wrong), `skaleclub-apps/COOLIFY.md`, and the portfolio plan register.

## 4. Open questions before step 3

- Host capacity on the Coolify server (RAM/disk) — measure, do not assume.
- Public data hostname (`data.xtimator.com`?) and Cloudflare proxy/SSL mode (memory: zones default to Flexible — set Full (strict) before proxying).
- Whether any code path still calls Supabase GoTrue/Storage endpoints in owned mode (grep `supabase.auth.` server calls that are not proxied by `withOwnedAuth`, `.storage.from(` in `analyze-photos` / `transcribe-audio`).
- Downtime window approval.

## 5. Execution log

**2026-11-06 — steps 1–2 code prep shipped (inert on Supabase):** `DATA_API_MODE` (`supabase` default | `postgrest`) with a self-signed `service_role` JWT (`lib/supabase/data-api.ts`); three Inngest crons replacing the live pg_cron jobs; notifications bell polls every 30 s instead of the no-op Realtime channel; compatibility shim `supabase/migrations/20261107000001_postgrest_compat_shim.sql` (NOT applied — it is a no-op on Supabase and only does work on vanilla Postgres); `scripts/db-copy.sh` + `docs/runbooks/db-to-coolify.md` (the runbook is the operational source of truth from here on).

Corrections found while implementing (supersede section 2/3 above):
- The shim runs **before AND after** `pg_restore`: the dump's policies call `auth.uid()` and columns use `extensions.vector`, and `--no-privileges` leaves restored tables ungranted.
- `PGRST_DB_MAX_ROWS=1000` for parity with Supabase's default cap (supabase-js does not paginate).
- Browser builds need an **anon JWT** (`{role:'anon'}` signed with the same secret) in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — vanilla PostgREST rejects the `sb_publishable_…` key.
- Boot env check now accepts `XTIMATOR_DATA_JWT_SECRET` in postgrest mode; CSP `connect-src` appends the data origin when it is not `*.supabase.co`.
- Operator scripts `scripts/{check-admin,grant-admin,seed-demo-workspace,auth-cutover}.mjs` still read `SUPABASE_SECRET_KEY` and need the service JWT after cutover.
- The Supabase project must stay alive after it becomes dev: the landing video and legacy image URLs are still served from Supabase (see `next.config.ts` CSP comments).
- No other Supabase-only endpoint (`/functions/v1`, `/realtime/v1`, Storage, GoTrue) is used in owned mode.

**2026-11-06 — same-origin Data API proxy (code, inert until env is set):** no DNS access for `data.xtimator.com`, so the browser now calls the app's own origin. `app/rest/v1/[...path]/route.ts` + `lib/supabase/data-proxy.ts` forward to `DATA_API_UPSTREAM_URL` (supabase mode, `apikey` replaced by `DATA_API_UPSTREAM_KEY`) or `POSTGREST_INTERNAL_URL` (postgrest mode, prefix stripped, `apikey` dropped). Server clients read `DATA_API_UPSTREAM_URL` first and never hop through the proxy; in postgrest mode they rewrite `/rest/v1/` to the internal URL. `proxy.ts` short-circuits `/rest/v1`. `scripts/sign-data-jwt.mjs anon|service`. Consequence: the browser build vars switch BEFORE the cutover (normal rolling deploy, runbook section 5) and the cutover itself is a runtime env change plus a restart. This supersedes the `data.xtimator.com` plan in steps 3 and 5 above.

**Next:** Coolify API access for Xtimator (`COOLIFY_BASE` + `COOLIFY_TOKEN` in `.env.local`, requested from the owner), then step 3 provisioning and the rehearsal copy.
