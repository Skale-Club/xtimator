# Summary — 260829-w53 Telegram ops alerting

## Headline

Layer 2 was **already built and already switched on** in production. This task
added only the two missing layers and a deadman, and routed everything new
through the existing `notifyOps()` rather than standing up a second system.

## Delivered

| Layer | What | Files |
| --- | --- | --- |
| 1 EXTERNAL | Uptime probe (transition-only), cron deadman, deploy notices | `.github/workflows/uptime-probe.yml`, `scripts/telegram-notify.sh`, `build-deploy.yml` (+2 steps) |
| 2 INTERNAL | *reused as-is* — 10 kinds, 31 call sites | `lib/observability/ops-alert.ts` (untouched) |
| 3 AGGREGATE | Error-rate spike, 10/5 min, 30 min cooldown | `lib/observability/error-spike.ts`, hook in `lib/errors/index.ts` |
| Deadman | Heartbeat per cron + status endpoint | `lib/observability/cron-heartbeat.ts`, `app/api/health/crons/route.ts`, migration |
| Docs | | `docs/TELEGRAM-ALERTS.md` |

Bot: **@xtimatoroppsbot**, chat id `8664810189` (private chat = the operator's
own user id, hence identical to the id already stored).

## Applied to prod DB

`supabase/migrations/20260829000001_cron_heartbeats.sql` — applied via MCP
before the code shipped (migrations are manual here). Verified: RLS enabled, 0
policies, `anon`/`authenticated` denied SELECT. Two baseline rows seeded,
marked `{"bootstrap": true}`.

## Verified, not assumed

- Telegram delivery end-to-end against the live bot: success, bad token, hostile
  commit message, UTF-8 emoji.
- Probe script extracted from the YAML and executed under `bash -e` (as GitHub
  runs it) against real production: healthy path, dead-host path, forced failure.
- No shell injection: `$(touch …)` and backticks in `COMMIT_MSG` did not execute.
- `tsc -p tsconfig.ci.json` clean. 11 new unit tests pass.

## Bugs found and fixed *in this work*

1. **`curl --data-urlencode` silently mangles non-ASCII on Git Bash/MSYS** —
   replaced every emoji with `?` and Telegram answered `{"ok":true}`. A
   corruption that reports success. Switched to a JSON body (jq → Python →
   form fallback).
2. **A commit message containing `<` killed the alert** — `parse_mode=HTML`
   rejected the whole message. Added body escaping mirroring `formatOpsMessage()`.
3. **`curl … || echo` produced a garbage duration** — curl writes its `-w`
   output with no trailing newline before failing, so the fallback concatenated
   onto it (`000 0.027647000 90`). Rewrote `probe()` using an `if` form.
4. **Static-importing ops-alert into `lib/errors/index.ts` broke 3 unrelated
   suites** (team-invite, seat-billing-wiring, whatsapp/confirm-by-timeout) by
   dragging Sentry/Redis/Telegram/Supabase into every consumer's module graph.
   Made the notifier a memoised lazy import.
5. **Repeated `import()` dropped an alert** — two `import()` calls in one
   synchronous turn delivered only one call under Vitest's module mocking.
   Memoising the promise fixed it. Found by tracing, not by reading.

## Live finding (not part of the ask)

Production returned **zero bytes for 45 s** on two consecutive probes, then
**160 ms** once warm. Not an outage — a cold start. It sized the probe timeout
at 90 s; a 30 s probe would flap DOWN/UP forever. Worth investigating on its own:
users hitting an idle instance wait ~a minute.

## CI state

`vitest run tests/unit tests/eval` → **4 failures, all pre-existing**, proven by
running them against a stashed (clean-HEAD) tree:

- 3 × migration-shape tests (`sign-estimate-atomic`, `signature-evidence-retention`)
  — fail locally on Windows via CRLF, pass in CI.
- 1 × `mcp-route-contract` — order/parallelism-dependent flake; passes alone,
  and also failed with my changes reverted.

## Still needs the operator

1. Set repo secrets `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — layer 1 no-ops
   silently without them (by design).
2. Decide whether the new bot replaces the one currently configured in
   `/admin/integrations`, which is live and sending today.
