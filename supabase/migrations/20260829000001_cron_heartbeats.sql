-- Quick task 260829-w53 — a deadman switch for the scheduled jobs.
--
-- WHY THIS EXISTS
--
-- .github/workflows/cron-jobs.yml no longer schedules anything: every `schedule:`
-- was removed when scheduling moved to the `skale-cron` crontab on the Coolify
-- VPS (GitHub billed a full minute per curl and throttled short intervals badly).
-- The cron ROUTES still alert loudly when they fail — both call notifyOps with
-- kind 'cron_failed', which is a LOCKED platform event and always reaches
-- Telegram. That covers failure.
--
-- It does not cover SILENCE. If the VPS crontab is edited, the container is
-- rebuilt without it, CRON_SECRET rotates, or the box simply stops firing the
-- entry, there is no failure to report — the jobs just never run. Nothing in
-- the system notices, because "no request arrived" produces no error anywhere.
-- Orphan projects stop being cleaned and expired WhatsApp sessions pile up,
-- silently, for as long as it takes someone to notice by hand.
--
-- This table is the missing evidence: each cron records that it SUCCEEDED, and
-- an outside observer (.github/workflows/uptime-probe.yml, via
-- GET /api/health/crons) alerts when a job's last success is older than the
-- interval it is supposed to run at.
--
-- WHY A TABLE AND NOT REDIS
--
-- lib/redis.ts is optional by design: getRedis() returns null when
-- UPSTASH_REDIS_REST_URL/TOKEN are unset, and every caller degrades to a no-op.
-- A deadman that silently stops recording when Redis is absent is precisely the
-- failure it is meant to detect, so it must not depend on an optional store.
-- Postgres is already a hard dependency of both cron routes.
--
-- One row per job, upserted. No history: the question is only "when did this
-- last work", and an unbounded log would need its own retention job — another
-- cron, which would need its own deadman.

create table if not exists public.cron_heartbeats (
  job          text primary key,
  last_success_at timestamptz not null default now(),
  last_detail  jsonb
);

comment on table public.cron_heartbeats is
  'Deadman switch for scheduled jobs. One row per job, upserted on SUCCESS only. '
  'Read by GET /api/health/crons; staleness is alerted by the external uptime probe. '
  'Scheduling itself lives in the skale-cron crontab on the Coolify VPS, not in CI.';

comment on column public.cron_heartbeats.last_success_at is
  'Set on successful completion only. A failed run leaves this untouched on purpose: '
  'the failure already alerts via notifyOps(cron_failed), and letting a failure refresh '
  'the heartbeat would mask a job that runs and fails forever.';

-- RLS: this is platform-operator telemetry, never tenant data. No policies are
-- created, so with RLS enabled the anon/authenticated roles can read nothing;
-- the service-role client used by the cron routes and the health endpoint
-- bypasses RLS. This matches the deny-by-default posture used for other
-- platform-scoped tables.
alter table public.cron_heartbeats enable row level security;

revoke all on public.cron_heartbeats from anon, authenticated;

-- Baseline row per watched job, so the deadman starts counting from the moment
-- the watch is installed rather than firing immediately.
--
-- Without this, a job with no row is indistinguishable from a job that has gone
-- silent, and getCronHeartbeats() reports it stale — so the probe would alert
-- the instant this shipped, before any cron had had a chance to run once. That
-- is the cry-wolf failure the whole design is trying to avoid.
--
-- `bootstrap: true` marks these as "watch started here", NOT as an observed
-- success, so nobody later reads a heartbeat that no job actually wrote as
-- evidence the job ran. The first real run overwrites it and drops the marker.
-- ON CONFLICT DO NOTHING keeps a re-run from rewinding a genuine heartbeat.
insert into public.cron_heartbeats (job, last_success_at, last_detail)
values
  ('cleanup-orphan-projects',   now(), '{"bootstrap": true}'::jsonb),
  ('cleanup-whatsapp-sessions', now(), '{"bootstrap": true}'::jsonb)
on conflict (job) do nothing;
