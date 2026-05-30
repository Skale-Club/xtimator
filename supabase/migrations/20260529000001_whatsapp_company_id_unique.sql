-- Quick fix 260529-jh7: add UNIQUE (company_id) to company_whatsapp
-- Fixes runtime error: "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification" thrown by lib/actions/whatsapp-settings.ts
-- upserts that use { onConflict: 'company_id' }.
-- Design intent: one WhatsApp config per company. Table is empty at apply time,
-- so no dedup/backfill is required.
-- Applied via: mcp apply_migration (Supabase Xtimator) + bunx supabase db push for parity.

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_whatsapp_company_id_key'
  ) THEN
    ALTER TABLE public.company_whatsapp
      ADD CONSTRAINT company_whatsapp_company_id_key UNIQUE (company_id);
  END IF;
END $do$;
