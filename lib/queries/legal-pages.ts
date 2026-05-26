import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type LegalPage = {
  id: string
  title: string
  content: string
  effective_date: string | null
  updated_at: string
  updated_by_email: string | null
}

export async function getLegalPage(id: string): Promise<LegalPage | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('legal_pages')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as LegalPage | null) ?? null
}
