-- Consolidate the legacy Staff surface into Team.
-- The manager-provided name follows the pending invite into company_members
-- so estimate PDFs can resolve "Prepared by" through created_by_user_id.

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.company_invites.display_name IS
  'Human-readable invitee name copied to company_members on acceptance for estimate attribution.';
