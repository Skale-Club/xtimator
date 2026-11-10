-- Phase 3b: WhatsApp welcome sequence.
--   * whatsapp_authorized_senders.welcome_template_sent_at: stamped (atomic claim) when the
--     approved welcome template is sent to the owner's phone after onboarding, so only one
--     template is ever sent per sender, whichever of onboarding completion / consent fires first.
--   * whatsapp_company_configs.first_estimate_tips_sent_at: stamped (atomic claim) when the two
--     tip messages are sent after the company's first ready estimate on WhatsApp.
-- Idempotent. Both tables are RLS deny-all (service role only); no policy changes.
ALTER TABLE public.whatsapp_authorized_senders
  ADD COLUMN IF NOT EXISTS welcome_template_sent_at timestamptz;

ALTER TABLE public.whatsapp_company_configs
  ADD COLUMN IF NOT EXISTS first_estimate_tips_sent_at timestamptz;

COMMENT ON COLUMN public.whatsapp_authorized_senders.welcome_template_sent_at IS
  'When the approved welcome template (reply call to action) was sent to this sender after onboarding. NULL = not sent.';
COMMENT ON COLUMN public.whatsapp_company_configs.first_estimate_tips_sent_at IS
  'When the two post-first-estimate tip messages were sent. NULL = not sent.';

NOTIFY pgrst, 'reload schema';
