-- supabase/migrations/20260718000001_phase171_photos_ai_extraction.sql
-- Phase 171 (PEXT-01): photos gains an additive `ai_extraction` JSONB column
-- — the versioned, zod-validated PhotoExtraction (lib/ai/photo-extraction-
-- schema.ts, schema key `version: 1`) that 171-02's structured extraction
-- pipeline persists per analyzed photo (surfaces, measurements, materials,
-- damage, trade_signals, access_notes, overall_description). Nullable, no
-- default, dormant-first: NULL means "prose-only photo" — today's behavior,
-- unchanged — and every photo analyzed while the kill-switch
-- (PHOTO_STRUCTURED_EXTRACTION) is off, or any pre-existing row, stays NULL
-- forever. No backfill of legacy photos in v1 (FUT-02, deliberately
-- deferred) — the serializer handles both the prose-only and structured
-- shapes.
--
-- Idempotent: safe to re-run. NOT applied to remote directly — deploy is
-- CI->GHCR->Coolify (consistent with phases 106/108/110/167/168), the
-- pipeline owns applying it.

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS ai_extraction JSONB;

COMMENT ON COLUMN public.photos.ai_extraction IS
  'Phase 171 (PEXT-01): optional structured extraction (lib/ai/photo-extraction-schema.ts PhotoExtraction, versioned via the "version" key, currently 1) — surfaces/measurements/materials/damage/trade_signals/access_notes/overall_description. Nullable/dormant-first: NULL means prose-only (today''s behavior); no backfill of pre-existing rows in v1.';
