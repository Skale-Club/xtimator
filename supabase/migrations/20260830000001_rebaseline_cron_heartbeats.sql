-- Quick task 260829-w53 follow-up — re-seed the cron deadman baseline at
-- CODE-LIVE time rather than migration time.
--
-- WHAT WENT WRONG
--
-- 20260829000001 created cron_heartbeats and seeded one baseline row per job so
-- the watch would "start counting when the watch is installed" instead of
-- alerting the instant it shipped. That reasoning was right; the timestamp was
-- not. The migration was applied at 03:24 UTC, but recordCronHeartbeat() did
-- not exist in production until the deploy landed at ~12:32 UTC (a1ca4cfe).
--
-- For those ~9 hours NOTHING could have written a heartbeat — no crontab, no
-- manual run, nothing — because the recorder was not deployed. The baseline
-- aged past cleanup-whatsapp-sessions' 60-minute window and /api/health/crons
-- duly reported `stale: true`, blaming the VPS crontab for the code's absence.
-- Had the probe been scheduled at that moment it would have fired a false
-- "crons have gone quiet" alert on day one — the exact cry-wolf failure the
-- baseline was introduced to prevent.
--
-- THE LESSON
--
-- For a deadman, "install time" is when the RECORDER goes live, not when its
-- table is created. Those are the same moment only when schema and code ship
-- together; here migrations are applied by hand, ahead of the deploy, so they
-- never are. Any future job added to CRON_JOBS must be baselined at ITS deploy,
-- not at its migration.
--
-- Only rows still carrying the bootstrap marker are moved. A job that has
-- already recorded a genuine success must never be rewound — that would erase
-- real evidence and hide a job that has actually stopped.

update cron_heartbeats
set last_success_at = now(),
    last_detail = '{"bootstrap": true, "rebaselined_at_code_live": true}'::jsonb
where last_detail ? 'bootstrap';
