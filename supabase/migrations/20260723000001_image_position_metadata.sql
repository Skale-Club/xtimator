-- supabase/migrations/20260723000001_image_position_metadata.sql
-- Quick task 260723: adds nullable JSONB position metadata columns so every
-- image-upload surface can support the new zoom + drag-to-reposition editor.
--
-- Shape (all columns): { "scale": number, "x": number, "y": number }
--   scale: 1 = fit-to-frame (the browser-computed cover baseline), >1 = zoomed in
--   x, y: percentage offset from center, roughly -50..50 (drag position)
-- NULL means "not set" — render code treats NULL as {scale:1, x:0, y:0} (today's
-- unpositioned object-cover behavior), so existing rows/images are unaffected
-- until an admin re-saves with a position.
--
-- Landing content (platform_branding.landing_content) and user avatars
-- (auth.users.user_metadata) are both already JSON/JSONB — position fields
-- nest directly into those payloads, no migration needed for either.
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS). NOT applied to
-- remote directly — migrations are applied manually per project convention
-- (see supabase/migrations/20260722000001_...). Apply to prod before the
-- position-editor UI writes real data — verify via:
--   select table_name, column_name from information_schema.columns
--   where column_name in ('logo_position', 'image_position', 'og_image_position', 'position')
--   and table_schema = 'public';

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_position jsonb;
COMMENT ON COLUMN public.companies.logo_position IS
  'Zoom/drag display position for logo_url: {scale, x, y}. NULL = centered, scale 1 (quick-260723-image-position).';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_position jsonb;
COMMENT ON COLUMN public.clients.logo_position IS
  'Zoom/drag display position for logo_url: {scale, x, y}. NULL = centered, scale 1 (quick-260723-image-position).';

ALTER TABLE public.company_price_book
  ADD COLUMN IF NOT EXISTS image_position jsonb;
COMMENT ON COLUMN public.company_price_book.image_position IS
  'Zoom/drag display position for image_url: {scale, x, y}. NULL = centered, scale 1 (quick-260723-image-position).';

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS position jsonb;
COMMENT ON COLUMN public.photos.position IS
  'Zoom/drag DISPLAY-ONLY position for the photo thumbnail: {scale, x, y}. NULL = centered, scale 1. Never affects the stored image bytes — AI photo analysis always reads the full original (quick-260723-image-position).';

ALTER TABLE public.platform_branding
  ADD COLUMN IF NOT EXISTS logo_position jsonb,
  ADD COLUMN IF NOT EXISTS og_image_position jsonb;
COMMENT ON COLUMN public.platform_branding.logo_position IS
  'Zoom/drag display position for logo_url: {scale, x, y}. NULL = centered, scale 1 (quick-260723-image-position).';
COMMENT ON COLUMN public.platform_branding.og_image_position IS
  'Zoom/drag display position for og_image_url: {scale, x, y}. NULL = centered, scale 1 (quick-260723-image-position).';

COMMIT;
