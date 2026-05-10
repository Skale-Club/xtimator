-- Phase 43: pg_cron job to purge expired whatsapp_sessions every 5 minutes
-- Vercel cron at /api/cron/cleanup-whatsapp-sessions handles notifications;
-- this pg_cron is a safety net to keep the table lean if Vercel cron misses a run.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-whatsapp-sessions'
  ) THEN
    PERFORM cron.schedule(
      'purge-expired-whatsapp-sessions',
      '*/10 * * * *',
      $$DELETE FROM whatsapp_sessions
        WHERE state = 'awaiting_confirm'
          AND expires_at < NOW() - INTERVAL '5 minutes'$$
    );
  END IF;
END $do$;
