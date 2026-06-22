-- Staff members: company staff roles, display metadata, estimate authorship
--
-- 1. Widen company_members.role to include 'staff'
-- 2. Add display_name + email columns to company_members
-- 3. Add created_by_user_id to estimates

-- ============================================================
-- 1. Widen role CHECK
-- ============================================================

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.company_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%owner%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.company_members DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_role_check CHECK (role IN ('owner', 'staff'));

COMMENT ON COLUMN public.company_members.role IS
  'Role within the company. ''owner'' = company creator; ''staff'' = invited team member.';

-- ============================================================
-- 2. Add display columns to company_members
-- ============================================================

ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS email        TEXT;

COMMENT ON COLUMN public.company_members.display_name IS
  'Human-readable name shown on estimates. Set on staff invite; nullable for legacy owner rows.';
COMMENT ON COLUMN public.company_members.email IS
  'Email address of the member. Stored for fast listing without joining auth.users.';

-- ============================================================
-- 3. Track which user created each estimate
-- ============================================================

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.estimates.created_by_user_id IS
  'auth.users.id of the owner or staff member who created this estimate. Drives the "Prepared by" field in PDFs.';
