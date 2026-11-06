# Production database: Supabase -> Coolify PostgreSQL + PostgREST

Operator runbook for SEED-059 (`.planning/seeds/SEED-059-production-db-to-coolify.md`).
Every credential below is a placeholder (`<authenticator-password>`); real values live
in Coolify / GitHub Actions only and are never written to this repo.

The app keeps its data contract (supabase-js + RLS over a PostgREST). Only the server
behind `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1` changes. All code needed for this is
already merged and **inert while `DATA_API_MODE` is unset**:

| Piece | Where |
|---|---|
| Service client mode switch (`DATA_API_MODE=supabase\|postgrest`) | `lib/supabase/data-api.ts`, used by `lib/supabase/service.ts` + `lib/supabase/data-service.ts` |
| pg_cron replacements (Inngest) | `lib/inngest/functions/{cleanup-orphan-draft-projects,purge-whatsapp-processed-messages,purge-expired-whatsapp-sessions}.ts` |
| Notifications without Realtime | `components/notifications/use-notifications.ts` (30 s polling) |
| Compatibility shim (roles, `auth.*`, `extensions` schema, grants) | `supabase/migrations/20261107000001_postgrest_compat_shim.sql` |
| Copy + verify script | `scripts/db-copy.sh` |
| Boot env check understands postgrest mode | `lib/observability/env-check.ts` |
| CSP `connect-src` follows `NEXT_PUBLIC_SUPABASE_URL` | `next.config.ts` |

## 0. Before you start

- Measure host headroom on the Coolify server (RAM, disk, CPU). The prod DB is ~33 MB, so
  Postgres + PostgREST need well under 1 GB, but verify instead of assuming.
- Choose the public data hostname, e.g. `data.xtimator.com`. The browser calls it directly.
- Cloudflare: new zones default to SSL "Flexible". Set **Full (strict)** BEFORE proxying the
  data host, otherwise the origin's HTTP->HTTPS redirect loops.
- Agree the downtime window (about 10-15 min, quiet period around 06:00 UTC).
- Tooling on the machine that runs `db-copy.sh`: PostgreSQL **17** client tools
  (`pg_dump`, `pg_restore`, `psql`), `bash`, `diff`.

## 1. Provision PostgreSQL (Coolify)

1. New resource -> PostgreSQL, **custom image `pgvector/pgvector:pg17`**.
2. Internal network only: do NOT publish a public port. The app and PostgREST reach it over
   the Coolify network; the operator reaches it through an SSH tunnel (or a temporary
   firewall-restricted port during the rehearsal, closed afterwards).
3. Set the superuser password in Coolify (never in git). The superuser URL is
   `TARGET_DB_URL` for `db-copy.sh`.
4. Backups: scheduled daily backup to a **private** R2 bucket, then perform one real
   restore into a scratch database and run the section 4 comparison against it. A backup
   that was never restored is not a backup.
5. Create the application database (the name is free; examples use `xtimator`).

The shim (section 3) creates the roles `anon`, `authenticated`, `service_role`,
`authenticator`. It never sets a password: after the first copy run

```sql
ALTER ROLE authenticator PASSWORD '<authenticator-password>';
```

as the superuser (generate a long random value; it goes only into the PostgREST env below).

## 2. Provision PostgREST (Coolify)

Docker image resource `postgrest/postgrest` (pin the 12.x line Supabase runs; check the tag
on Docker Hub when you deploy). Environment:

| Variable | Value |
|---|---|
| `PGRST_DB_URI` | `postgres://authenticator:<authenticator-password>@<postgres-internal-host>:5432/xtimator` |
| `PGRST_DB_SCHEMAS` | `public` |
| `PGRST_DB_ANON_ROLE` | `anon` |
| `PGRST_JWT_SECRET` | the current value of `XTIMATOR_DATA_JWT_SECRET` (>= 32 bytes) |
| `PGRST_DB_MAX_ROWS` | `1000` (see note) |
| `PGRST_DB_EXTRA_SEARCH_PATH` | `public,extensions` (pgvector operators live in `extensions`) |
| `PGRST_DB_POOL` | `10` |
| `PGRST_SERVER_PORT` | `3000` |

Notes:

- **Max rows.** supabase-js does NOT paginate by itself (it was assumed to in SEED-059; it does
  not). Supabase applies a 1000-row cap by default, so the app has always been running under
  it. Self-hosted PostgREST has no cap when `PGRST_DB_MAX_ROWS` is unset, which would silently
  change behaviour (bigger payloads, different truncation). Set `1000` for parity; revisit
  only as a deliberate change.
- Do not set `PGRST_JWT_AUD`. User tokens carry `aud=authenticated`, the service token has none.
- PostgREST reads roles from the `role` claim (default `.role`): `authenticated` for owned
  sessions (`issueDataToken`), `service_role` for the service token, `anon` for no/anon token.
- After any schema change: `NOTIFY pgrst, 'reload schema';` (or restart the container).

**Routing.** Coolify's proxy (Traefik) exposes the container at the data host under the
`/rest/v1` prefix and **strips the prefix**, because supabase-js calls `${url}/rest/v1/...`
but PostgREST serves from `/`. Container labels (adapt names):

```
traefik.http.routers.xt-data.rule=Host(`data.xtimator.com`) && PathPrefix(`/rest/v1`)
traefik.http.routers.xt-data.middlewares=xt-data-strip
traefik.http.middlewares.xt-data-strip.stripprefix.prefixes=/rest/v1
```

Only `/rest/v1` is routed; everything else on that host must 404. Verify:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://data.xtimator.com/rest/v1/        # 200 (OpenAPI) or 401
curl -s -o /dev/null -w '%{http_code}\n' https://data.xtimator.com/                # 404
```

**Anonymous browser key.** When there is no session, supabase-js falls back to sending the
configured publishable/anon key as `Authorization: Bearer`. Supabase's `sb_publishable_...`
keys are meaningless to a vanilla PostgREST (it would answer 401 "JWT malformed"). So, for
the self-hosted data host, the build variables `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` must hold an **anon JWT signed with the same secret**:

```bash
node -e "const {SignJWT}=require('jose');new SignJWT({role:'anon',iss:'xtimator'}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuedAt().sign(new TextEncoder().encode(process.env.XTIMATOR_DATA_JWT_SECRET)).then(console.log)"
```

(no expiry on purpose: it grants only what `anon` already has, and it is public in the bundle).
Rotating `XTIMATOR_DATA_JWT_SECRET` later means re-issuing it and rebuilding.

## 3. Compatibility shim

`supabase/migrations/20261107000001_postgrest_compat_shim.sql` creates what Supabase gives for
free: the four roles, `auth.uid()/role()/jwt()`, the `extensions` schema with `pgcrypto`,
`uuid-ossp`, `vector`, and (only on a non-Supabase server) the broad grants for the request
roles plus default privileges. It is a **no-op on Supabase** and idempotent.

**Order matters, and it is not "restore then shim":** the dump's 459 policies call
`auth.uid()` and its columns use `extensions.vector`, so the shim must exist BEFORE
`pg_restore`; and since `--no-privileges` leaves restored tables ungranted, it must run
AGAIN after. `scripts/db-copy.sh` does shim -> restore -> shim. Do not apply this migration to
Supabase through `npm run db:migrate` unless you want its (empty) ledger row there; on the
self-hosted DB it is applied by the script.

## 4. Rehearsal copy (repeatable)

```bash
export SOURCE_DB_URL='postgresql://<user>:<password>@<supabase-direct-host>:5432/postgres'   # direct or session mode, NOT :6543
export TARGET_DB_URL='postgresql://postgres:<superuser-password>@<tunnel-or-host>:5432/xtimator'
bash scripts/db-copy.sh --reset-target
```

What it enforces:

- **Refuses** to run when the target host looks like Supabase (`*.supabase.co|com|in|net`,
  `*pooler.supabase*`, the prod project ref) or the target server has a `supabase_admin` role,
  or source equals target, or the source URL is the transaction pooler.
- Pre-flight: client tools >= 17, target server >= 17 with pgvector available, no FK from
  `public` into `auth`/`storage`/`vault` on the source (the owned-identity migration repointed
  them to `public.xtimator_accounts`; a leftover would break the restore).
- `pg_dump` 17, schemas `public` + `supabase_migrations`, `--no-owner --no-privileges`,
  custom format, mode 600, deleted on exit (`--keep-dump` to keep it; it holds customer data).
- Compares source vs target and **exits 1 on any difference**: per-table row counts,
  sequences, columns (with defaults), constraints, indexes, triggers, RLS flags, policies
  (count and text), functions (definition hash), views. Table grants for the request roles are
  reported as WARN only (a deliberate REVOKE on prod would show up here for you to reconcile).
- `--verify-only` re-runs the comparison without touching the target.

Not copied by design: `auth`, `storage`, `realtime`, `vault`, `supabase_functions`, `graphql`,
`pgsodium`, event triggers. `auth.users` holds 24 legacy rows that the app no longer reads
(identity is `xtimator_accounts`).

Then, on the target: set the `authenticator` password (section 1), start PostgREST, and run
the staging journey below.

### Staging journey

Point a staging deployment (or a local run) at the new data host with the section 6 env, then:
owned login (phone and Google), dashboard, create/edit/send an estimate, public estimate link,
signature flow, Stripe webhook (test mode), WhatsApp inbound, MCP, chat, credit-lot RPCs
(`expire_credit_lots`, grants/debits), notifications bell, Inngest crons (the three new ones
log `deleted: n`). Fix gaps and re-run the copy until the comparison is clean twice in a row.

## 5. Cutover checklist

Pre-checks (day before): rehearsal green twice; backup restore tested; `authenticator`
password and PostgREST healthy; anon JWT generated; GitHub variable change reviewed; rollback
values (the current Supabase URL and keys) written down in your password manager.

1. **Stop writes.** Stop the app container in Coolify (Inngest then retries against a dead
   endpoint; that is fine, jobs are idempotent). Confirm no traffic.
2. **Final copy:** `bash scripts/db-copy.sh --reset-target`. Must end with `OK: target is
   identical to source`. Keep going only on exit code 0.
3. **Env swap** (names only; values from your vault):
   - GitHub Actions **Variables** (build time, inlined into the bundle):
     `NEXT_PUBLIC_SUPABASE_URL` -> `https://data.xtimator.com`,
     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` -> the anon JWT.
   - Coolify **runtime** env of the app: `NEXT_PUBLIC_SUPABASE_URL` (same new value),
     `DATA_API_MODE=postgrest`, `XTIMATOR_DATA_JWT_SECRET` (unchanged value; must equal
     `PGRST_JWT_SECRET`). `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are not read in
     postgrest mode and the boot check no longer requires them; **keep them set until step 7**
     so rollback is a pure env revert.
4. **Redeploy.** The URL is a build-time `NEXT_PUBLIC_*` value, so push/re-run the
   `Build and Deploy` workflow (or `gh workflow run`) so a new image is built with the new
   variables; Coolify then pulls it. Follow `gh run watch`; the pipeline polls
   `/api/health` for the new SHA and re-syncs Inngest.
5. **Smoke list** (production, in this order): `/api/health` 200; owned login; dashboard
   loads; open an estimate; create + edit an estimate; send; open the public link in a private
   window; signature; PDF download; notifications bell polls (network tab: `/api/notifications/list`
   every 30 s, no websocket); WhatsApp inbound reply; Stripe test event; Inngest dashboard shows
   the app synced with the three new crons; Sentry quiet.
6. **Zero writes on Supabase.** On the OLD Supabase project (read-only SQL):
   `select relname, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_user_tables where schemaname='public' order by 2 desc limit 20;`
   twice, 10 minutes apart: the counters must not move. Any movement means something still
   writes to Supabase: find it before declaring success.
7. **pg_cron overlap ends.** Once step 6 is clean, the pg_cron jobs on the frozen Supabase copy
   are irrelevant. Leave them; the Supabase DB is now frozen and not serving traffic. After 7
   days remove the unused Supabase service keys from Coolify.

## 6. Rollback

Within the window, rollback is an env revert; the Supabase copy is frozen and intact:

1. Revert GitHub variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Supabase values; redeploy (rebuild).
2. Coolify runtime env: `NEXT_PUBLIC_SUPABASE_URL` back to Supabase; remove (or set to
   `supabase`) `DATA_API_MODE`; confirm `SUPABASE_SECRET_KEY` is still set.
3. Any rows written on the self-hosted DB after cutover are NOT on Supabase. If real traffic
   ran on the new DB, export those rows (compare by `updated_at` / `created_at`) and replay
   them to Supabase before reverting, or accept the loss window explicitly.

## 7. After the cutover

- **Dev guard.** The Supabase project `prmqgcrnpuvpzruyzvuv` becomes the development
  database. Add the explicit guard (same pattern as Xpot: `DEV_DATABASE_URL` +
  `DEV_SUPABASE_PROJECT_REF`) so `npm run dev` / dev scripts refuse any
  `NEXT_PUBLIC_SUPABASE_URL` that is not the dev project and never fall back to the production
  data host. `.env.local` must stop pointing at production.
- Keep that Supabase project alive: legacy rows still reference Supabase Storage URLs (landing
  video stays on Supabase egress per `next.config.ts`).
- The keepalive workflows (`.github/workflows/supabase-keepalive*.yml`) now keep the DEV project
  awake, which is what they should do.
- Operator scripts that read `SUPABASE_SECRET_KEY` (`scripts/check-admin.mjs`,
  `grant-admin.mjs`, `seed-demo-workspace.mjs`, `auth-cutover.mjs`) talk to the data host and
  need a service JWT in postgrest mode (sign one like section 2 with `role: 'service_role'`).
- Update `CLAUDE.md`, the memory `project_supabase_mcp_mapping` (it will be wrong), the
  `skaleclub-apps/COOLIFY.md` register and the portfolio plan.
- Archive the frozen prod copy after 7 days.
