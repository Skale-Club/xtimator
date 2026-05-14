-- Phase 60: pg_cron backup jobs for trial automation.
-- Primary trigger: Vercel cron (vercel.json). pg_cron = safety net.
-- Pattern: DO $do$ idempotency guard (same as Phase 43 cleanup-whatsapp-sessions).

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-trials') THEN
    PERFORM cron.schedule(
      'expire-trials',
      '0 * * * *',  -- hourly
      $$
        UPDATE companies
        SET tier_trial_ends_at = NULL
        WHERE tier = 'free'
          AND tier_trial_ends_at IS NOT NULL
          AND tier_trial_ends_at < NOW();
      $$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trial-warning-emails') THEN
    PERFORM cron.schedule(
      'trial-warning-emails',
      '0 9 * * *',  -- daily at 9am UTC (placeholder — real emails sent by Vercel cron route)
      $$SELECT 1;$$  -- no-op; Vercel cron route handles Resend API calls
    );
  END IF;
END
$do$;
