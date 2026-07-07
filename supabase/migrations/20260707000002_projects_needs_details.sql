-- QUICK-psh-01: adaptive vague handling — classify WHY a generation was too
-- vague to price + generate 2-4 concrete clarifying questions in the estimate
-- language. Set ONCE at the final vague terminal (the default web/MCP adapter's
-- `finalize`, after auto-refine's one retry is exhausted — see
-- lib/estimate/adapters/default.ts) and read by both the popup outcome
-- (lib/actions/attempt-outcome.ts) and the project-page needs-details banner
-- (components/workspace/needs-details-banner.tsx).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS needs_details JSONB;

COMMENT ON COLUMN public.projects.needs_details IS
  'QUICK-psh-01: classification + clarifying questions persisted when a generation was discarded as too vague to price. Shape: { reason: ''mic_test''|''too_short''|''missing_specifics'', questions: string[], attempt_id: uuid, created_at: iso }. Written exactly once per discarded attempt at the final vague terminal; null when never set or after a later successful generation supersedes it.';
