# Production database: Supabase -> Coolify PostgreSQL + PostgREST

Operator runbook for SEED-059 (`.planning/seeds/SEED-059-production-db-to-coolify.md`).
Every credential below is a placeholder (`<authenticator-password>`); real values live
in Coolify / GitHub Actions only and are never written to this repo.

The app keeps its data contract (supabase-js + RLS over a PostgREST). Only the server
behind the Data API changes. The browser never talks to the data host directly: it calls the
app's own origin (`https://xtimator.com/rest/v1/...`) and the **same-origin proxy**
(`app/rest/v1/[...path]/route.ts`, `lib/supabase/data-proxy.ts`) forwards to the upstream. No
extra DNS record or public data hostname is needed. All code needed for this is
already merged and **inert while `DATA_API_MODE` is unset**:

| Piece | Where |
|---|---|
| Same-origin Data API proxy at `/rest/v1` (browser -> app -> upstream) | `app/rest/v1/[...path]/route.ts`, `lib/supabase/data-proxy.ts` |
| Operator JWT signer (`anon` / `service`) | `scripts/sign-data-jwt.mjs` |
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
- No public data hostname is needed: PostgREST stays on the Coolify internal network and the
  app proxies to it (`POSTGREST_INTERNAL_URL`). If you ever publish a data host anyway, set
  Cloudflare SSL to **Full (strict)** BEFORE proxying it; direct mode still works (leave
  `POSTGREST_INTERNAL_URL` unset and point `DATA_API_UPSTREAM_URL` / `NEXT_PUBLIC_SUPABASE_URL` at it).
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

**Routing.** PostgREST is **not** exposed publicly. Give the container no domain; the app reaches it
at `POSTGREST_INTERNAL_URL` (e.g. `http://<postgrest-container-name>:3000`, same Coolify network as the
app). PostgREST serves from `/` (no `/rest/v1` prefix); the app's proxy and server clients strip it.
Verify from the app container: `curl -s -o /dev/null -w '%{http_code}\n' $POSTGREST_INTERNAL_URL/` (200 or 401).

**Anonymous browser key.** When there is no session, supabase-js falls back to sending the
configured publishable/anon key as `Authorization: Bearer`. So, in BOTH modes, the build
variables `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` hold an
**anon JWT signed with `XTIMATOR_DATA_JWT_SECRET`** (PostgREST needs it because it rejects
`sb_publishable_...`; Supabase accepts it because that secret is the project JWT secret):

```bash
XTIMATOR_DATA_JWT_SECRET=<secret> node scripts/sign-data-jwt.mjs anon      # no expiry, public in the bundle
XTIMATOR_DATA_JWT_SECRET=<secret> node scripts/sign-data-jwt.mjs service   # 1 h, operator scripts
```

The anon JWT grants only what the `anon` role already has. Rotating the secret means re-issuing it
and rebuilding. In **supabase mode** the proxy replaces the browser `apikey` header with the
server-side gateway key (`DATA_API_UPSTREAM_KEY`, the Supabase publishable key) because the Supabase
gateway does not recognise the app-signed token as a project key; `Authorization` passes through.

### Environment reference (same-origin proxy)

| Variable | Kind | Pre-cutover (Supabase) | After cutover (PostgREST) |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | GitHub **build** var | `https://xtimator.com` | unchanged |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | GitHub **build** vars | anon JWT | unchanged |
| `NEXT_PUBLIC_SUPABASE_URL` | Coolify runtime | keep the Supabase URL (server prefers `DATA_API_UPSTREAM_URL`) | unchanged |
| `DATA_API_UPSTREAM_URL` | Coolify runtime, server-only | `https://<ref>.supabase.co` | may stay (unused in postgrest mode) |
| `DATA_API_UPSTREAM_KEY` | Coolify runtime, server-only | Supabase publishable key | unused |
| `DATA_API_MODE` | Coolify runtime | unset / `supabase` | `postgrest` |
| `POSTGREST_INTERNAL_URL` | Coolify runtime | unset | `http://<postgrest-container>:3000` |
| `XTIMATOR_DATA_JWT_SECRET` | Coolify runtime | set (equals the Supabase project JWT secret) | same value (= `PGRST_JWT_SECRET`) |
| `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Coolify runtime | required | keep until step 7 of the cutover |

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

Point a staging deployment (or a local run) at the new data host with the cutover env (section 6, step 3), then:
owned login (phone and Google), dashboard, create/edit/send an estimate, public estimate link,
signature flow, Stripe webhook (test mode), WhatsApp inbound, MCP, chat, credit-lot RPCs
(`expire_credit_lots`, grants/debits), notifications bell, Inngest crons (the three new ones
log `deleted: n`). Fix gaps and re-run the copy until the comparison is clean twice in a row.

## 5. Pre-cutover deploy (zero downtime, any time before the window)

Ship the proxy first, still on Supabase, as a normal rolling deploy:

1. Generate the anon JWT (`node scripts/sign-data-jwt.mjs anon`).
2. GitHub Actions **Variables**: `NEXT_PUBLIC_SUPABASE_URL=https://xtimator.com`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon JWT.
3. Coolify runtime env: `DATA_API_UPSTREAM_URL=https://<ref>.supabase.co`,
   `DATA_API_UPSTREAM_KEY=<supabase publishable key>`; leave `DATA_API_MODE` unset and
   `NEXT_PUBLIC_SUPABASE_URL` as is.
4. Push / run `Build and Deploy`. Smoke: login, dashboard, an estimate; the browser network tab shows
   `https://xtimator.com/rest/v1/...` (200/206) and nothing to `*.supabase.co`.

Rollback of this step: restore the three GitHub variables to the Supabase values and redeploy.

## 6. Cutover checklist

Pre-checks (day before): rehearsal green twice; backup restore tested; `authenticator`
password and PostgREST healthy; anon JWT generated; GitHub variable change reviewed; rollback
values (the current Supabase URL and keys) written down in your password manager.

1. **Stop writes.** Stop the app container in Coolify (Inngest then retries against a dead
   endpoint; that is fine, jobs are idempotent). Confirm no traffic.
2. **Final copy:** `bash scripts/db-copy.sh --reset-target`. Must end with `OK: target is
   identical to source`. Keep going only on exit code 0.
3. **Runtime env swap only (no rebuild).** The browser build already points at the app's own
   origin (see section 5), so the cutover is just Coolify **runtime** env: `DATA_API_MODE=postgrest`,
   `POSTGREST_INTERNAL_URL=http://<postgrest-container>:3000` (`XTIMATOR_DATA_JWT_SECRET` unchanged and
   equal to `PGRST_JWT_SECRET`). Keep `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` set until
   step 7 so rollback is a pure env revert.
4. **Restart the app** in Coolify (a restart is enough; the boot check then requires
   `XTIMATOR_DATA_JWT_SECRET` instead of the Supabase service key).
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

## 7. Rollback

Within the window, rollback is a runtime env revert (no rebuild): remove `DATA_API_MODE` (or set
`supabase`) and `POSTGREST_INTERNAL_URL`, confirm `DATA_API_UPSTREAM_URL`, `DATA_API_UPSTREAM_KEY` and
`SUPABASE_SECRET_KEY` are still set, restart the app. The Supabase copy is frozen and intact.

Any rows written on the self-hosted DB after cutover are NOT on Supabase. If real traffic
   ran on the new DB, export those rows (compare by `updated_at` / `created_at`) and replay
   them to Supabase before reverting, or accept the loss window explicitly.

## 8. After the cutover

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
  need a service JWT in postgrest mode (`node scripts/sign-data-jwt.mjs service`).
- Update `CLAUDE.md`, the memory `project_supabase_mcp_mapping` (it will be wrong), the
  `skaleclub-apps/COOLIFY.md` register and the portfolio plan.
- Archive the frozen prod copy after 7 days.

## 8. Execution log

### 2026-11-07 - Coolify provisioning and rehearsal copy (SEED-059 steps 3-4)

Production stayed on Supabase; nothing of the `xtimator` app was touched. No secret appears
here: operator secrets live in the gitignored `.env.local` under `XTIMATOR_COOLIFY_DB_PASSWORD`,
`XTIMATOR_COOLIFY_AUTHENTICATOR_PASSWORD` (and the existing `XTIMATOR_DATA_JWT_SECRET`).

Resources (Coolify project `skale-apps`, environment `production`, server `localhost`, network `coolify`):

| Name | uuid | Image / limits | Notes |
|---|---|---|---|
| `xtimator-db` | `ly7mvq7dm3p26mwqvf7kx5se` | `pgvector/pgvector:pg17`, 512m | internal only (`is_public=false`), user/db `xtimator`, backup `0 4 * * *` keep 14 local (schedule `cafi8ya2shvrc4lgrkgx6ycy` was created on the orphan; a new one exists on this DB). Internal host = the uuid. |
| `xtimator-postgrest` | `esxqqajn1d15wznbqzkrxwjx` | `postgrest/postgrest:v12.2.12`, 128m | no domain; network alias `xtimator-postgrest`; port 3000, admin 3001 (`/ready`, `/live`). Env as in section 2. |
| `xtimator-db-copy` | `kwjcffgakizqpafitngd6mmv` | `postgres:17-alpine`, 1024m | throwaway helper, no domain, STOPPED after the rehearsal; scheduled task `mncdid5g6rpkq0xwpcclhegq` (disabled). |
| `xtimator-db-ORPHAN-delete-me` | `vfomsys1gqo5ofyoqt4tohvn` | stopped | first DB whose password was lost; empty; the token cannot delete, owner deletes it in the UI. |

Result of `db-copy.sh --reset-target` (exit 0, about 60 s for dump + restore + shim + compare over the
Supabase session pooler): 82 tables, 2 sequences, 892 columns, 318 constraints, 246 indexes, 8 triggers,
82 RLS flags, **639 RLS policies** (the "459" in earlier notes was stale), 34 functions, 1 view and
227 request-role grant rows, all identical. `credit_lots` invariant on source and target:
0 of 19 companies mismatching, sum(credit_balance) = sum(live lots) = 37397.

PostgREST acceptance (from inside the network, JWTs signed in the helper with the production data secret):
`/ready` 200, `/live` 200; service_role `GET /companies` 19 rows (= source), `POST /rpc/get_platform_user_count` 24 (= source);
authenticated JWT of a live-session user (claims as `sessionClaims`, including `session_id`) sees exactly its 1
company and only its own `company_members` row; the same JWT without a live `session_id` sees 0 rows (the
RESTRICTIVE `xtimator_owned_session` policy); authenticated `POST /credit_lots` 403; anon and no token `GET /companies` 200 with `[]`.

Bugs found by the rehearsal and fixed in `scripts/db-copy.sh`:

1. The comparison sorted rows with each server's collation, so identical data differed only in order
   (constraints, functions). Both sides are now `LC_ALL=C sort`ed before diffing.
2. The shim's blanket `GRANT ALL` is wider than production, which REVOKEs writes on several tables
   (`credit_lots`, `credit_ledger`, `invoices`, `xtimator_*`, ...). After the second shim run the script now
   resets `anon/authenticated/service_role` on `public` and replays the SOURCE ACLs (tables, sequences, columns,
   functions). The grants comparison is now a hard gate instead of a WARN.

How the copy was run without SSH (repeat it at cutover):

1. Start `xtimator-db-copy`. Its env holds `SOURCE_DB_URL` (the pooler URL on port 5432, session mode),
   `TARGET_DB_URL`, `AUTHENTICATOR_PASSWORD`, `DB_COPY_SCRIPT_B64`, `SHIM_SQL_B64` and `RUN_B64` (a small dispatcher).
2. After editing `scripts/db-copy.sh`, refresh `DB_COPY_SCRIPT_B64` (base64, CRLF stripped) and restart the helper;
   a restart wipes `/tmp` and installed packages, so run the `setup` step again (`apk add bash diffutils curl openssl`).
3. Scheduled-task commands are limited to about 255 characters, so the task runs `echo "$RUN_B64" | base64 -d | sh -s <step>`.
   Enable the task, wait for its execution, disable it again. Output is read from the task execution `message`
   (needs a token with `read:sensitive`).
4. `db-copy.sh --reset-target` (step 7), then `ALTER ROLE authenticator PASSWORD` from `AUTHENTICATOR_PASSWORD`,
   then start `xtimator-postgrest` and run the acceptance checks against `http://xtimator-postgrest:3000`.

Cutover runner notes: reuse these resources; the final copy needs only steps 2-4 above (`--reset-target`, the
authenticator password is already set and survives because the role lives outside the copied schemas, but re-run
the `ALTER ROLE` anyway). Still to do: public data host + Traefik `/rest/v1` strip-prefix route, the anon JWT
build variables, R2 backup bucket and a tested restore, and deleting the orphan DB.
