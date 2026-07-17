-- supabase/migrations/20260717000001_phase164_signature_snapshot.sql
-- Phase 164 Plan 01 (TRUST-01): close audit finding A1/A2 -- a signed estimate
-- must prove WHAT was signed. estimate_signatures currently stores the
-- signature PNG + IP + UA but NO amount, NO items (migrations/20260519000002).
-- A post-sign edit to the live estimate silently changes what every
-- client-facing surface (public share link, on-demand PDF) renders.
--
-- Dormant-first (ENG-02): both columns nullable, no backfill. NULL = legacy
-- signature -- share/PDF keep rendering the live rows exactly as today
-- (byte-identical retrocompat, see lib/queries/share.ts + pdf/route.ts).
-- Historical signatures cannot be reconstructed truthfully (the live rows at
-- the time of signing are gone), so we do NOT fabricate a snapshot for them.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Authored-only -- committed and carried
-- by CI->GHCR->Coolify; NOT applied here (never `supabase db push` from this repo).
ALTER TABLE estimate_signatures
  ADD COLUMN IF NOT EXISTS signed_content JSONB,
  ADD COLUMN IF NOT EXISTS signed_total   NUMERIC(12,2);

COMMENT ON COLUMN estimate_signatures.signed_content IS
  'Immutable snapshot (SignedContentSnapshot, lib/estimate/signed-snapshot.ts) of every rendered/editable estimate field captured at the moment of signing (app/api/estimates/[id]/sign/route.ts). NULL = legacy signature predating this column -- share/PDF render the live estimate rows unchanged. Once set, NEVER updated -- a signature we cannot evidence is the exact bug TRUST-01 closes.';

COMMENT ON COLUMN estimate_signatures.signed_total IS
  'estimate.total at the moment of signing, mirrored alongside signed_content so pay-amount derivation (total_amount_cents) can re-key off the signed value instead of the live (possibly since-edited) estimate.total. NULL = legacy signature (see signed_content).';
