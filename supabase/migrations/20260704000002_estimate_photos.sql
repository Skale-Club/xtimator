-- Optional per-photo, per-estimate-version photo attachments.
-- A business owner can toggle any job-site photo onto the specific estimate
-- version currently being viewed (Photos tab -> attach/detach toggle). Attached
-- photos render in the editor document, the PDF export, and the public share
-- link, but only when at least one photo is attached.
BEGIN;

CREATE TABLE estimate_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (estimate_id, photo_id)
);
CREATE INDEX estimate_photos_estimate_id_idx ON estimate_photos(estimate_id);
CREATE INDEX estimate_photos_photo_id_idx ON estimate_photos(photo_id);

ALTER TABLE estimate_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimate_photos_select" ON estimate_photos FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));
CREATE POLICY "estimate_photos_insert" ON estimate_photos FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));
CREATE POLICY "estimate_photos_update" ON estimate_photos FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));
CREATE POLICY "estimate_photos_delete" ON estimate_photos FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));
-- Defense-in-depth only: the public share page reads via requireServiceClient() (bypasses RLS),
-- but keep this consistent with the existing estimates_anon_select_by_share_token policy.
CREATE POLICY "estimate_photos_anon_select_by_share_token" ON estimate_photos FOR SELECT TO anon
  USING (estimate_id IN (SELECT id FROM estimates WHERE share_token IS NOT NULL));

COMMIT;
