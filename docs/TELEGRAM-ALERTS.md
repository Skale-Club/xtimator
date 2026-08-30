# Telegram alerts

Xtimator reports what the operator needs to know to a Telegram chat: the site
going down, scheduled jobs going quiet, the AI pipeline failing, money moving,
and any burst of server errors.

Bot: **@xtimatoroppsbot** ("Xtimator | Opps"), created for this project alone.
Don't share it with another project — a shared bot means a shared chat, and a
shared chat is one you eventually mute.

## Setting it up

1. Message **@BotFather**, send `/newbot`, follow the prompts. It replies with a
   token like `8839558981:AAE...`.
2. **Send the bot any ordinary text message.** Telegram will not let a bot open
   a conversation, so an un-messaged bot fails with `403 Forbidden`. Tapping
   *Start* does not always produce an update the API can read — sending a normal
   message does.
3. Read the chat id from
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → `result[].message.chat.id`.
   For a private chat this is **your own user id**, so it is the same for every
   bot you talk to — switching bots does not change it. Group ids are negative.
4. Put the pair in **two** places:

   | Where | Which layer needs it |
   | --- | --- |
   | `/admin/integrations` → Telegram (bot token + chat id) | Layer 2 + 3 (in-app) |
   | GitHub repo **secrets** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Layer 1 (uptime probe, deploy notices) |

   Both are needed because the alerts come from two different machines, on
   purpose — see below. The in-app half stores the token **encrypted** in
   `platform_integrations`; it is never an env var (see
   `lib/platform-config.ts`).

Optionally set the repo **variable** `TELEGRAM_THREAD_ID` if the destination is
a group with Topics enabled and you want alerts in a specific topic.

## What you get told

| Alert | Layer | Source | When |
| --- | --- | --- | --- |
| 🚨 Xtimator is DOWN / ✅ back UP | 1 | GitHub Actions | `/api/health/live` fails 3× (~5 min) |
| ⚠️ Crons have gone quiet / ✅ running again | 1 | GitHub Actions | a job misses its heartbeat window |
| 🚀 Deploy succeeded / 🚨 Deploy FAILED | 1 | GitHub Actions | every deploy |
| Estimate generation / transcription / photo analysis failed | 2 | app | per failure, deduped |
| Generation pipeline stuck | 2 | app | `pipeline-watchdog`, every 10 min |
| Scheduled cron job failed | 2 | app | the route ran and threw |
| AI provider fallback engaged | 2 | app | primary model unavailable |
| Tenant signup / payment received / quota exhausted | 2 | app | per event |
| 🔴 Server error rate spike | 3 | app | >10 errors in 5 min |

Layer 2 already existed before this document and is wired into 31 call sites
through one choke point, `notifyOps()` in `lib/observability/ops-alert.ts`. Every
kind except the locked ones can be switched off per-kind in
`/admin/integrations`.

## Why the monitoring lives in three places

This is the part worth understanding, because it is what makes the system
trustworthy rather than merely reassuring.

**A server that is down cannot tell you it is down.** Every in-app alert path —
`notifyOps`, the pipeline watchdog, the error-rate counter — runs *inside* the
process it is meant to report on. When that process hangs or dies, all of them
die with it, silently, exactly when you need them. So uptime checking runs on
**GitHub Actions**: outside the container, outside the host, outside Hetzner.

**But an HTTP probe from outside is nearly blind.** It sees "the page loads" and
stays green while estimate generation fails for every tenant, a payment webhook
double-charges, or the AI provider silently degrades to a fallback. Only the app
knows those. That is layer 2.

**And neither can see a rate.** A single broken endpoint produces hundreds of
errors a minute; alerting per error floods the channel, and a channel that
floods is one you mute — which costs you the alerts that matter. Layer 3 watches
the *rate* and sends one message naming what broke.

Three vantage points, three blind spots, deliberately overlapping.

## Alert fatigue is a failure mode

An alerting system people mute is worse than none, so:

- **Uptime alerts fire on transitions only.** One message when it goes down, one
  when it comes back — not one every ten minutes for an hour. The state is the
  open `outage` GitHub issue itself, not an Actions cache: the issue is already
  the per-outage record, and a cache would be a second source of truth that can
  be evicted independently of it.
- **Cron staleness uses a separate `cron-stale` issue.** A silent crontab and a
  dead app are different incidents with different runbooks; sharing one issue
  would let recovery from one close the other.
- **The error-rate alert has a 30-minute cooldown.** An outage lasts longer than
  one window, and repeating "still broken" every five minutes is how a channel
  trains people to ignore it.
- **The probe retries 3× before calling it down.** A rolling Coolify deploy
  briefly has no healthy container; alerting on that would page on every deploy.

### Why the probe timeout is 90 seconds

Measured 2026-08-29: after a long idle period the first request to
`xtimator.com` returned **zero bytes for 45 s**, then answered in **160 ms** once
warm. A 30-second probe would have called that an outage, alerted, recovered,
and repeated — and flapping is how a channel earns being muted. 90 s tolerates
the cold start; past that is a real fault.

A side effect worth knowing: probing every 10 minutes keeps the container warm,
so the probe partly suppresses the cold-start it was sized around.

## Where the error-rate threshold came from

Measured on this project *before* choosing it (30-day window, 2026-08-29):

| Signal | Window | Value |
| --- | --- | --- |
| Sentry `errors` | 30 d | **8** (~0.27/day) |
| Sentry `errors` | 7 d | **2** |
| Sentry `logs` dataset | 30 d | **0 ingested** |
| `pipeline_events` failed | 90 d | **10 / 320 (3.1%)** |

**Threshold: 10 errors in 5 minutes, 30-minute cooldown** — roughly two orders
of magnitude above that background. Override with `ERROR_SPIKE_THRESHOLD` and
`ERROR_SPIKE_COOLDOWN_MS`.

It is deliberately blunt. With a near-zero baseline there is no measured
*operating* error rate to calibrate against, so this is the smallest round
number that cannot fire on noise. **Revisit it once the app carries real
traffic**; the number to beat is the busiest normal 5-minute window.

One caveat that shaped the design: the Sentry figure **understates** real error
volume, because `SENTRY_CAPTURE_TYPES` in `lib/errors/index.ts` forwards only
`internal` and `offline`, and no logs are ingested at all. Everything else is a
`console.error` that dies on the box. That is why the counter lives in-process
at the `asResponse()` choke point rather than querying Sentry — it sees every
error the API returns, including the ones Sentry never hears about.

## The cron deadman

`.github/workflows/cron-jobs.yml` no longer schedules anything: scheduling moved
to the **`skale-cron` crontab on the Coolify VPS**. The cron routes still alert
loudly when they *fail* (`cron_failed`, a locked event). They cannot alert on
**silence** — a crontab that stops firing produces no request, no error, and
nothing to report.

So each cron writes a row to `cron_heartbeats` when it *succeeds*, and the
probe reads `/api/health/crons` and alerts when a heartbeat goes stale.

- Failure does **not** refresh the heartbeat, on purpose: letting it do so would
  hide a job that runs and fails forever behind the very signal meant to expose
  it.
- Windows are roughly 2× the schedule (`cleanup-whatsapp-sessions`: 60 min;
  `cleanup-orphan-projects`: 30 h) so normal jitter and a missed tick don't page.
- The intervals live in `CRON_JOBS` in `lib/observability/cron-heartbeat.ts`.
  **Keep them in sync with the VPS crontab** — if a schedule changes there and
  not here, the deadman either cries wolf or goes blind.
- The migration seeds one baseline row per job marked `{"bootstrap": true}`, so
  the watch starts counting at install time instead of alerting the moment it
  ships. That marker means "watch started here", never "the job ran".

> **Baseline a new job at its DEPLOY, not at its migration.** This was got wrong
> the first time. The table was created at 03:24 UTC and the recorder went live
> at ~12:32 UTC; for those nine hours nothing could write a heartbeat, so the
> baseline aged out and `/api/health/crons` reported `stale: true` — blaming the
> VPS crontab for the code's absence. Migrations here are applied by hand, ahead
> of the deploy, so schema-time and code-time are never the same moment. Fixed
> in `20260830000001_rebaseline_cron_heartbeats.sql`; the same trap applies to
> every job added to `CRON_JOBS` later.

## Failure is always silent

`scripts/telegram-notify.sh` **always exits 0**, and `notifyOps()` **never
throws**. A missing token is a no-op with a warning.

This is load-bearing in both directions:

- In CI, `supabase-keepalive-monitor.yml` reads this repo's workflow-run history
  to decide whether to open an issue. A Telegram problem — a bad token, a
  Telegram outage — must never colour a run and corrupt that decision. Only the
  probe result may set red/green. The alert steps also carry
  `continue-on-error: true`, stating the guarantee twice rather than trusting a
  script to stay correct forever.
- In the app, a notification is never worth failing a request over. If Telegram
  is down, the estimate is still generated and the customer is still charged.

The trade-off is that a misconfigured bot fails quietly. If alerts stop arriving
with no other symptom, check a recent `Uptime Probe` run — a refusal is printed
as a `::error::` annotation with Telegram's own explanation.

## Moving the alerts elsewhere

Changing the destination is configuration only — no code change.

1. Create the group and add **@xtimatoroppsbot** to it.
2. Send any message in the group, then read the id from
   `https://api.telegram.org/bot<TOKEN>/getUpdates`. **Group ids are negative**
   (`-1001234567890`); keep the minus sign.
3. Replace the chat id in **both** places — `/admin/integrations` and the
   `TELEGRAM_CHAT_ID` repo secret.
4. If the group has Topics enabled and you want a specific topic, set the
   `TELEGRAM_THREAD_ID` repo variable to that topic's id. Leave it empty
   otherwise; the parameter is omitted entirely when unset.

### The failure mode to know about

When a regular group is upgraded to a **supergroup** — which Telegram does
automatically when you add certain features — **the chat id changes**, and every
alert after that silently fails. Nothing looks broken; the messages simply stop.

Both halves handle this as well as they can: on rejection they log Telegram's
own explanation, which carries the replacement id:

```text
::error::Telegram refused the alert: {"ok":false,"error_code":400,
"description":"Bad Request: group chat was upgraded to a supergroup chat",
"parameters":{"migrate_to_chat_id":-1001234567890}}
```

Copy that `migrate_to_chat_id` into both places and alerts resume.

## Two encoding traps, both found the hard way

Both were reproduced against the live bot while building this; neither is
theoretical.

**1. `curl --data-urlencode` corrupts non-ASCII on Git Bash / MSYS.** It
transcodes the form field through the ANSI codepage and replaces every non-ASCII
byte with `?` — and Telegram answers `{"ok":true}` for the mangled message. A
corruption that reports success is the worst possible failure for an alert
channel. `telegram-notify.sh` therefore sends a **JSON body** built by `jq` (or
Python), falling back to form encoding only if neither exists.

**2. A commit message containing `<` kills the alert.** Messages are sent with
`parse_mode=HTML`, so `<`, `>` and `&` are markup. A commit subject reading
`fix: 5<10` produced:

```text
Bad Request: can't parse entities: Unsupported start tag "10" at byte offset 120
```

The script now HTML-escapes the **body** (never the title, which intentionally
carries `<b>`), mirroring `formatOpsMessage()` in `lib/observability/ops-alert.ts`.

## A rule for editing the workflows

Never interpolate commit or PR content — `${{ github.event.workflow_run.head_commit.message }}`
and friends — directly inside a `run:` block. GitHub substitutes `${{ }}` into
the script **text** before bash parses it, so a commit message containing a
quote, a backtick or `$(...)` stops being data and becomes shell. That is both a
command-injection hole and a way for an innocent apostrophe to break a deploy.
Pass it through `env:` and reference it as `"$COMMIT_MSG"`, as the deploy steps
in `build-deploy.yml` do.

## Testing it end to end

```bash
gh workflow run "Uptime Probe" -f force_failure=true
```

Forces a failed probe: files the `outage` issue and pushes the DOWN alert. The
next scheduled run closes the issue and sends the recovery message.

To test only the script:

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... bash scripts/telegram-notify.sh "<b>test</b>" "body"
```

## Files

| Path | Role |
| --- | --- |
| `scripts/telegram-notify.sh` | Layer 1 sender. Always exits 0. |
| `.github/workflows/uptime-probe.yml` | Layer 1 probe + cron deadman. |
| `.github/workflows/build-deploy.yml` | Deploy success/failure notices (last two steps). |
| `lib/observability/ops-alert.ts` | Layer 2 choke point — `notifyOps()`. |
| `lib/telegram/client.ts` | In-app sender; dormant until configured. |
| `lib/observability/error-spike.ts` | Layer 3 rate counter. |
| `lib/observability/cron-heartbeat.ts` | Deadman recorder + reader. |
| `app/api/health/crons/route.ts` | Deadman status endpoint. |
| `lib/notifications/platform-events.ts` | Event kinds + which are locked. |
