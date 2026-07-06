-- Pre-launch audit fix (B4 — IDOR in GET /api/jobs/[jobId]): the route's own
-- comment admitted "any signed-in user can poll any jobId... tracked as a
-- follow-up before production deploy". This table lets the route verify the
-- polling user's active company actually owns the job before returning its
-- output (which can include estimateId and other tenant data).
--
-- Written once at dispatch time (generate-estimate, analyze-photos, transcribe,
-- and the channel-neutral chat/MCP create-estimate path all call
-- inngest.send() and then record the mapping here), read once per poll.
-- Deny-all RLS — service role only, mirroring processed_stripe_events /
-- whatsapp_processed_messages (webhook/dispatch-managed dedup-style tables).

CREATE TABLE IF NOT EXISTS public.job_dispatch_ownership (
  event_id    TEXT PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_dispatch_ownership_created
  ON public.job_dispatch_ownership(created_at);

ALTER TABLE public.job_dispatch_ownership ENABLE ROW LEVEL SECURITY;
-- No policies — deny-all for anon/authenticated. Service role bypasses RLS
-- (writes at dispatch time, reads in the /api/jobs/[jobId] ownership check).

COMMENT ON TABLE public.job_dispatch_ownership IS
  'Maps an Inngest event id (the "jobId" the client polls) to the company that dispatched it, so GET /api/jobs/[jobId] can reject cross-tenant polling. Rows are small and short-lived in relevance (job finishes within minutes) but are not actively pruned yet — low volume, one row per dispatched job.';
