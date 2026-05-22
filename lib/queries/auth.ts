import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'

export interface AppCompany {
  id: string
  name: string
  logo_url: string | null
  owner_name: string | null
  theme_preference: string | null
  industry: string | null
  currency_code: string
}

export const getAuthClaims = cache(async () => {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  return claimsData?.claims ?? null
})

export const getCachedCompany = unstable_cache(
  async (userId: string): Promise<AppCompany | null> => {
    // Use service client — unstable_cache cannot call cookies() internally.
    // Service role bypasses RLS; the userId arg scopes the query correctly.
    const supabase = requireServiceClient()
    const { data } = await supabase
      .from('companies')
      .select('id, name, logo_url, owner_name, theme_preference, industry, currency_code')
      .eq('user_id', userId)
      .single()
    return (data as AppCompany) ?? null
  },
  ['company-for-user'],
  { revalidate: 60, tags: ['company'] }
)
