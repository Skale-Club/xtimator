-- EstimateBuilder Pro — Initial Schema Migration
-- Phase 1: Foundation & Auth
-- D-07: All PKs use UUID DEFAULT gen_random_uuid()
-- D-08: Hard-delete only (no deleted_at columns)

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  license_number TEXT,
  insurance_info TEXT,
  industry TEXT,
  brand_primary_color TEXT DEFAULT '#2563EB',
  logo_url TEXT,
  default_tax_rate NUMERIC(5,4) DEFAULT 0,
  default_payment_terms TEXT,
  default_warranty_terms TEXT,
  default_validity_days INTEGER DEFAULT 30,
  notify_on_view BOOLEAN DEFAULT true,
  notify_on_accept BOOLEAN DEFAULT true,
  notify_on_decline BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  logo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  project_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  target_budget NUMERIC(12,2),
  total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  duration_seconds INTEGER,
  transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  ai_description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  share_token UUID DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft',
  summary TEXT,
  notes TEXT,
  timeline TEXT,
  payment_terms TEXT,
  warranty_terms TEXT,
  subtotal NUMERIC(12,2) DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(5,4) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  client_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE estimate_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0
);

CREATE TABLE estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES estimate_sections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE estimate_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY — Enable on all tables (SEC-01)
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_activity ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- COMPANIES: direct user_id match (root table, no company_id subquery)
CREATE POLICY "companies_select" ON companies FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "companies_insert" ON companies FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "companies_update" ON companies FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "companies_delete" ON companies FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- CLIENTS
CREATE POLICY "clients_select" ON clients FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "clients_insert" ON clients FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "clients_update" ON clients FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "clients_delete" ON clients FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- PROJECTS
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- RECORDINGS
CREATE POLICY "recordings_select" ON recordings FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "recordings_insert" ON recordings FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "recordings_update" ON recordings FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "recordings_delete" ON recordings FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- PHOTOS
CREATE POLICY "photos_select" ON photos FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "photos_insert" ON photos FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "photos_update" ON photos FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "photos_delete" ON photos FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ESTIMATES: authenticated CRUD + anon read for public share links (SEC-02)
CREATE POLICY "estimates_select" ON estimates FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimates_insert" ON estimates FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimates_update" ON estimates FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimates_delete" ON estimates FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
-- Public share link access (SEC-02): anon role can read estimate by share_token
CREATE POLICY "estimates_anon_select_by_share_token" ON estimates FOR SELECT TO anon
  USING (share_token IS NOT NULL);

-- ESTIMATE_SECTIONS
CREATE POLICY "estimate_sections_select" ON estimate_sections FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimate_sections_insert" ON estimate_sections FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimate_sections_update" ON estimate_sections FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimate_sections_delete" ON estimate_sections FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ESTIMATE_ITEMS
CREATE POLICY "estimate_items_select" ON estimate_items FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimate_items_insert" ON estimate_items FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimate_items_update" ON estimate_items FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimate_items_delete" ON estimate_items FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ESTIMATE_ACTIVITY
CREATE POLICY "estimate_activity_select" ON estimate_activity FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimate_activity_insert" ON estimate_activity FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "estimate_activity_delete" ON estimate_activity FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ============================================================
-- STORAGE BUCKETS (SEC-04)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('audio',  'audio',  false, 52428800,  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/*']),
  ('photos', 'photos', false, 10485760,  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/*']),
  ('pdfs',   'pdfs',   false, 20971520,  ARRAY['application/pdf']),
  ('logos',  'logos',  false, 5242880,   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/*'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: files stored at {company_id}/{filename}
-- storage.foldername(name)[1] extracts the first path component = company_id

-- AUDIO bucket
CREATE POLICY "company_audio_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "company_audio_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "company_audio_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );

-- PHOTOS bucket
CREATE POLICY "company_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "company_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "company_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );

-- PDFS bucket
CREATE POLICY "company_pdfs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "company_pdfs_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "company_pdfs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );

-- LOGOS bucket
CREATE POLICY "company_logos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "company_logos_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'logos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "company_logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
