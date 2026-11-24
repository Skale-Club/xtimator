-- Supabase can inherit browser-role table grants through default privileges.
-- Keep command evidence protected by both deny-all RLS and explicit privileges.
REVOKE ALL ON TABLE public.whatsapp_estimate_session_watermarks,
  public.whatsapp_estimate_commands, public.whatsapp_estimate_delivery_channels
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_estimate_session_watermarks,
  public.whatsapp_estimate_commands, public.whatsapp_estimate_delivery_channels TO service_role;

NOTIFY pgrst, 'reload schema';
