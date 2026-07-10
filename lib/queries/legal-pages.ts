import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

export type LegalPage = {
  id: string
  title: string
  content: string
  effective_date: string | null
  updated_at: string
  updated_by_email: string | null
}

// Public legal-page reads use the cookieless service-role client (same pattern
// as lib/platform-config.ts) so the pages can be ISR-cached instead of forcing
// per-request dynamic rendering via the cookie-based client. The legal_pages
// RLS policy is public-read (`USING (true)`), so bypassing RLS with the service
// role returns exactly the same rows an anon reader would see. createServiceClient()
// returns null during the static build phase (secret key absent as a build arg);
// callers degrade to null and revalidate on-demand at runtime.
export async function getLegalPage(id: string): Promise<LegalPage | null> {
  const svc = createServiceClient()
  if (!svc) return null
  const { data } = await svc
    .from('legal_pages')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as LegalPage | null) ?? null
}
