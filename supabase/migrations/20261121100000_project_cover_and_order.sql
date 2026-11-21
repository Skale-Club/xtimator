-- Project thumbnails and a custom project order (XTM-SIDE-PANEL-1, deliveries 3 and 4).
--
-- 1. Custom order: projects.sort_order. Lower = higher in the list. It is a
--    double so a move only rewrites the moved row (midpoint between its new
--    neighbours); the app renumbers a company when two neighbours get too
--    close. Backfill keeps today's default order (newest first), and a
--    BEFORE INSERT trigger puts every new project on top, whatever code path
--    creates it (web, WhatsApp, MCP, duplicate, draft resume).
--
-- 2. Thumbnail: a small WebP (160px, centre crop) in the private `photos`
--    bucket under <company_id>/<project_id>/cover-<uuid>.webp, rendered only
--    on authenticated list pages through the same-origin storage proxy.
--      cover_mode       'auto'   first project photo (default)
--                       'photo'  a photo the owner picked (cover_photo_id)
--                       'upload' an image uploaded only as the cover; it is
--                                NOT a project photo, so the AI never sees it
--                       'none'   the owner removed it (initials are shown)
--      cover_thumb_path the stored thumbnail key, null = nothing to show yet
--      cover_photo_id   the picked photo; ON DELETE SET NULL (the app falls
--                       back to auto when that photo is deleted)
--
-- Columns are added only (nothing dropped or rewritten), so old code keeps
-- working against the new schema. Existing RLS policies on projects cover the
-- new columns. Idempotent; safe to re-run.
-- Apply by hand on BOTH databases (Supabase dev and Coolify production)
-- before pushing the code that reads these columns, then reload PostgREST.

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sort_order DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cover_mode TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS cover_thumb_path TEXT,
  ADD COLUMN IF NOT EXISTS cover_photo_id UUID REFERENCES public.photos(id) ON DELETE SET NULL;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_cover_mode_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_cover_mode_check
  CHECK (cover_mode IN ('auto', 'photo', 'upload', 'none'));

-- Backfill the order: newest first, 1..n per company (only rows not set yet).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC, id) AS rn
  FROM public.projects
  WHERE sort_order IS NULL
)
UPDATE public.projects p
SET sort_order = ranked.rn
FROM ranked
WHERE p.id = ranked.id;

-- New projects go on top of their company's list.
CREATE OR REPLACE FUNCTION public.projects_set_sort_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MIN(sort_order), 1) - 1
      INTO NEW.sort_order
      FROM public.projects
     WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_set_sort_order ON public.projects;
CREATE TRIGGER projects_set_sort_order
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_set_sort_order();

CREATE INDEX IF NOT EXISTS idx_projects_company_sort_order
  ON public.projects (company_id, sort_order);

COMMIT;

NOTIFY pgrst, 'reload schema';
