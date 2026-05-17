-- ============================================================================
-- platform_integrations: allow NULL on ciphertext/iv/auth_tag for metadata-only rows
-- ============================================================================
-- Context: Phase 22 introduced 'ai_config' as a metadata-only provider row
-- (carries `metadata.selected_ai_provider` to switch active AI) but the original
-- table schema (Phase 8) required ciphertext+iv+auth_tag NOT NULL since every
-- row was expected to hold an encrypted API key.
--
-- This migration relaxes the constraint so metadata-only rows like ai_config
-- can be upserted without dummy encryption bytes.
--
-- Encrypted-key rows (resend, anthropic, openai, gemini, stripe_connect_client_id,
-- meta_whatsapp) continue to populate all three columns at the application layer.

ALTER TABLE public.platform_integrations
  ALTER COLUMN ciphertext DROP NOT NULL,
  ALTER COLUMN iv DROP NOT NULL,
  ALTER COLUMN auth_tag DROP NOT NULL;

-- Add a sanity CHECK: metadata-only rows MUST have metadata set; encrypted-key
-- rows must have all three crypto columns populated. Prevents accidental
-- half-set rows.
ALTER TABLE public.platform_integrations
  ADD CONSTRAINT platform_integrations_data_shape_check CHECK (
    -- metadata-only row: all crypto cols null, metadata set
    (ciphertext IS NULL AND iv IS NULL AND auth_tag IS NULL AND metadata IS NOT NULL)
    -- encrypted-key row: all crypto cols set
    OR (ciphertext IS NOT NULL AND iv IS NOT NULL AND auth_tag IS NOT NULL)
  );
