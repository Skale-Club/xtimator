# Quick Task 260829-w53 — Telegram ops alerting (three layers)

## Context

Requested: a Telegram bot that reports "everything this system can do wrong",
modelled on Xkedule (`scripts/telegram-notify.sh`, `server/lib/error-spike-alert.ts`)
and Stuscle (`docs/TELEGRAM-ALERTS.md`, `deploy/watchdog.sh`).

**Inventory first (the Xkedule lesson: don't build a second, competing system).**

### What already exists — DO NOT REBUILD

| Piece | Where | State |
| --- | --- | --- |
| `notifyOps()` fan-out (Redis dedupe → Sentry → Telegram, never throws) | `lib/observability/ops-alert.ts` | **live** |
| Telegram send client (dormant-until-configured) | `lib/telegram/client.ts` | **live** |
| Per-kind admin toggle matrix + locked criticals | `lib/observability/platform-preferences.ts`, `lib/notifications/platform-events.ts` | **live** |
| 10 platform event kinds, 31 call sites | crons, Stripe, Connect, quota, AI fallback, transcribe, vision, generate, watchdog | **live** |
| Telegram credentials in prod | `platform_integrations` provider `telegram`, chat_id `8664810189` | **configured, all 10 kinds enabled** |
| Sentry (server + edge + client), Langfuse OTel | `instrumentation.ts` | **live** |
| Health endpoints | `/api/health` (DB+storage+commit), `/api/health/live` (dependency-free) | **live** |

Layer 2 (INTERNAL) is therefore **already complete and switched on**. This task
adds only what is missing, and routes everything new through `notifyOps`.

### What is missing

1. **Layer 1 (EXTERNAL)** — nothing probes the app from outside. If it dies,
   nothing tells anyone. `supabase-keepalive-monitor.yml` watches the Supabase
   keepalive, not the app, and its `schedule:` is commented out.
2. **Layer 3 (AGGREGATE)** — no alert by error *rate*.
3. **Cron deadman** — `cron-jobs.yml` has every `schedule:` removed; scheduling
   moved to the `skale-cron` crontab on the Coolify VPS. The routes alert
   `cron_failed` when they FAIL, but if the VPS crontab stops firing there is
   no failure — only silence, which nothing detects.

## Measured baseline (drives the layer-3 threshold)

| Signal | Window | Value |
| --- | --- | --- |
| Sentry `errors` | 30d | **8** |
| Sentry `errors` | 7d | **2** |
| Sentry `logs` dataset | 30d | **0 ingested** |
| `pipeline_events` failed | 90d | **10 / 320 (3.1%)** |
| Estimates created | 30d | 4 (155 total, 19 companies) |

Background rate ≈ **0.27 Sentry errors/day**. Understated, because
`lib/errors/index.ts` only forwards `internal`/`offline` to Sentry — everything
else is `console.error` and dies on the box. So the aggregate layer cannot be
built from Sentry; it hooks the in-process choke point instead.

**Threshold chosen: 10 errors / 5 min, 30 min cooldown** (`ERROR_SPIKE_THRESHOLD`,
`ERROR_SPIKE_COOLDOWN_MS` override). Same as Xkedule. Justification: with a
near-zero baseline this is the smallest number that cannot fire on background
noise; there is no measured *operating* rate to calibrate against yet.

## Live finding that shapes the probe

During inventory, `xtimator.com` returned **zero bytes for 45 s** twice, then
answered **HTTP 200 in 160 ms** once warm. Not down — a cold-start of 45–110 s
on a dependency-free route. Consequences:

- The probe timeout must be **generous (90 s)**. A 30 s probe would flap
  DOWN/UP forever, which is how a channel gets muted.
- A probe every 10 min keeps the container warm, so it partly fixes the
  problem it measures. Documented, not relied upon.

## Tasks

1. `scripts/telegram-notify.sh` — port of Xkedule's. **Always `exit 0`.** Prints
   Telegram's own rejection text (which carries the replacement id on
   supergroup migration). No-op with a `::warning::` when creds are absent.
2. `supabase/migrations/*_cron_heartbeats.sql` — 1 table, additive, for the
   deadman. Applied to prod BEFORE the code ships (migrations are manual here).
3. `lib/observability/cron-heartbeat.ts` — `recordCronHeartbeat(job)`, never throws.
4. Wire both cron routes to record a heartbeat on success.
5. `app/api/health/crons/route.ts` — reports age of each job's last success.
6. `.github/workflows/uptime-probe.yml` — external probe, **transition-only**
   alerting, `outage` issue as the transition state (Xkedule's design: one
   store, not an evictable Actions cache), plus the cron staleness check.
7. `lib/observability/error-spike.ts` + hook in `lib/errors/index.ts`.
8. `docs/TELEGRAM-ALERTS.md`.

## Hard rules (learned the expensive way)

- The alert step **never fails the job**. `supabase-keepalive-monitor.yml`
  decides by reading CI run history; a bad token must not colour that.
- No credential → silent no-op. A notification is never worth failing a request.
- Never interpolate `${{ github.event.head_commit.message }}` (or any
  commit/PR content) inside a `run:` — it is substituted before bash parses.
  Pass through `env:` instead.
- When inserting into an existing workflow, confirm where the previous step
  actually ends.
- Never write `estimates` (its `updated_at` is a concurrency token).
