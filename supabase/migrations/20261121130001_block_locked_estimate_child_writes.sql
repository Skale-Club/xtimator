-- supabase/migrations/20261121130001_block_locked_estimate_child_writes.sql
-- An answered or signed estimate is read-only (lock-at-acceptance,
-- 20261116000001), but that rule lived only inside save_estimate_atomic. Every
-- other writer of estimate_sections / estimate_items was free to change the lines
-- of an accepted estimate:
--
--   * the WhatsApp item edits (lib/whatsapp/confirm-actions.ts) update, insert
--     and delete estimate_items with the service role and no lock check;
--   * any authenticated company member can write those tables through PostgREST
--     (RLS only checks company membership).
--
-- The signed snapshot keeps the public page and the PDF frozen, but the editor,
-- the totals and an acceptance recorded without a signature (no snapshot) read
-- the live rows.
--
-- This migration enforces the rule in the database, for every writer: a BEFORE
-- trigger on both tables refuses INSERT, DELETE and any UPDATE that really
-- changes a row when the parent estimate has a client_response or a signature.
-- It raises the new SQLSTATE P0022 'estimate_locked' (P0001-P0004 save, P0005
-- delete block, P0006-P0009 sign, P0010-P0016 change orders, P0017-P0020
-- activation, P0021 foreign row).
--
-- The check locks the parent estimate row first (FOR UPDATE), the same row
-- sign_estimate_atomic and save_estimate_atomic lock. A line edit racing a
-- signature therefore waits: it either lands first (the signature then fails its
-- version check, P0007) or sees the acceptance and is refused. It can never slip
-- in after the snapshot was taken.
--
-- What stays allowed:
--   * deleting the estimate itself (or its project / company): the cascade
--     reaches the child rows after the parent is gone, so there is nothing to
--     protect. A SIGNED estimate is still undeletable (20260729000001);
--   * an UPDATE that rewrites the same values (idempotent recomputes);
--   * a deliberate maintenance or seed transaction that runs
--     SET LOCAL app.allow_locked_estimate_write = 'on' first. PostgREST cannot
--     set it; scripts/seed-video-workspace.mjs uses it to insert the lines of the
--     accepted estimates it creates.
--
-- No data changes. Idempotent.
-- Apply by hand to BOTH databases (Supabase dev and Coolify production) BEFORE
-- the deploy that depends on it; the deploy never runs migrations.

CREATE OR REPLACE FUNCTION public.assert_estimate_children_writable(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_response text;
BEGIN
  IF p_estimate_id IS NULL THEN
    RETURN;
  END IF;

  IF current_setting('app.allow_locked_estimate_write', true) = 'on' THEN
    RETURN;
  END IF;

  -- Lock, then judge: a concurrent sign_estimate_atomic holds this same lock
  -- while it writes client_response, so the value read here is the committed one.
  SELECT client_response
    INTO v_client_response
    FROM public.estimates
    WHERE id = p_estimate_id
    FOR UPDATE;

  -- Parent already deleted in this statement (ON DELETE CASCADE): nothing to protect.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_client_response IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = p_estimate_id
  ) THEN
    RAISE EXCEPTION 'estimate_locked' USING ERRCODE = 'P0022';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_locked_estimate_section_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_estimate_children_writable(NEW.estimate_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.assert_estimate_children_writable(OLD.estimate_id);
    RETURN OLD;
  END IF;

  PERFORM public.assert_estimate_children_writable(OLD.estimate_id);
  IF NEW.estimate_id IS DISTINCT FROM OLD.estimate_id THEN
    PERFORM public.assert_estimate_children_writable(NEW.estimate_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_locked_estimate_item_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estimate_id uuid;
BEGIN
  -- An item reaches its estimate through its section. A section deleted in this
  -- statement (cascade) is already gone: the lookup finds nothing and the write
  -- is allowed (the section's own trigger has already judged the estimate).
  IF TG_OP = 'INSERT' THEN
    SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = NEW.section_id;
    PERFORM public.assert_estimate_children_writable(v_estimate_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = OLD.section_id;
    PERFORM public.assert_estimate_children_writable(v_estimate_id);
    RETURN OLD;
  END IF;

  SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = OLD.section_id;
  PERFORM public.assert_estimate_children_writable(v_estimate_id);
  IF NEW.section_id IS DISTINCT FROM OLD.section_id THEN
    SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = NEW.section_id;
    PERFORM public.assert_estimate_children_writable(v_estimate_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Not callable through PostgREST: the triggers run them as their owner.
REVOKE EXECUTE ON FUNCTION public.assert_estimate_children_writable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_locked_estimate_section_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_locked_estimate_item_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_estimate_sections_block_locked_ins_del ON public.estimate_sections;
CREATE TRIGGER trg_estimate_sections_block_locked_ins_del
  BEFORE INSERT OR DELETE ON public.estimate_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.block_locked_estimate_section_write();

DROP TRIGGER IF EXISTS trg_estimate_sections_block_locked_upd ON public.estimate_sections;
CREATE TRIGGER trg_estimate_sections_block_locked_upd
  BEFORE UPDATE ON public.estimate_sections
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.block_locked_estimate_section_write();

DROP TRIGGER IF EXISTS trg_estimate_items_block_locked_ins_del ON public.estimate_items;
CREATE TRIGGER trg_estimate_items_block_locked_ins_del
  BEFORE INSERT OR DELETE ON public.estimate_items
  FOR EACH ROW
  EXECUTE FUNCTION public.block_locked_estimate_item_write();

DROP TRIGGER IF EXISTS trg_estimate_items_block_locked_upd ON public.estimate_items;
CREATE TRIGGER trg_estimate_items_block_locked_upd
  BEFORE UPDATE ON public.estimate_items
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.block_locked_estimate_item_write();

COMMENT ON FUNCTION public.assert_estimate_children_writable(uuid) IS
  'Lock-at-acceptance in the database: raises P0022 estimate_locked when the estimate has a client_response or a signature. Called by the BEFORE triggers on estimate_sections / estimate_items, so no writer can change the lines of an answered estimate. Bypass for deliberate maintenance: SET LOCAL app.allow_locked_estimate_write = ''on''.';
