-- Security Review S08: the public buckets `logos` and `platform-brand` allowed
-- `image/svg+xml` (and `logos` also had an `image/*` wildcard). SVGs can carry
-- inline <script>, and these buckets are served from a public Supabase origin,
-- so a malicious SVG opened directly would execute JS (stored XSS).
-- jpeg/png/webp fully cover logo/brand needs, so drop SVG + the wildcard.
--
-- Existing objects are unaffected; only NEW uploads are constrained.
-- Rollback: re-add 'image/svg+xml' (and 'image/*' for logos) to allowed_mime_types.

UPDATE storage.buckets
  SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
  WHERE id IN ('logos', 'platform-brand');
