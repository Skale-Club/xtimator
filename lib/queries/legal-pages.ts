import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import {
  FALLBACK_LEGAL_PAGES,
  LEGAL_EFFECTIVE_DATE,
  type LegalPageId,
} from '@/lib/legal/fallback-content'

export type LegalPage = {
  id: string
  title: string
  content: string
  effective_date: string | null
  updated_at: string
  updated_by_email: string | null
}

export type { LegalPageId }

function fallbackPage(id: LegalPageId): LegalPage {
  const page = FALLBACK_LEGAL_PAGES[id]
  return {
    id: page.id,
    title: page.title,
    content: page.content,
    effective_date: LEGAL_EFFECTIVE_DATE,
    updated_at: LEGAL_EFFECTIVE_DATE,
    updated_by_email: null,
  }
}

// Public legal-page reads use the cookieless service-role client (same pattern
// as lib/platform-config.ts) so the pages can be ISR-cached instead of forcing
// per-request dynamic rendering via the cookie-based client. The legal_pages
// RLS policy is public-read (`USING (true)`), so bypassing RLS with the service
// role returns exactly the same rows an anon reader would see. createServiceClient()
// returns null during the static build phase (secret key absent as a build arg).
//
// This never returns null and never throws: when the row is missing or the read
// fails, the static draft in lib/legal/fallback-content.ts is served, so the
// Terms and Privacy URLs (required by Google Play) can never 404.
export async function getLegalPage(id: LegalPageId): Promise<LegalPage> {
  try {
    const svc = createServiceClient()
    if (svc) {
      const { data, error } = await svc
        .from('legal_pages')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (!error && data) return data as LegalPage
    }
  } catch (err) {
    console.warn('[getLegalPage] read failed, serving the static fallback:', err)
  }
  return fallbackPage(id)
}
