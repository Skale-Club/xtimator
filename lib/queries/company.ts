import type { SupabaseClient } from '@supabase/supabase-js'

export interface CompanySettings {
  id: string
  user_id: string
  name: string
  owner_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  license_number: string | null
  insurance_info: string | null
  industry: string | null
  brand_primary_color: string | null
  logo_url: string | null
  default_tax_rate: number
  default_payment_terms: string | null
  default_warranty_terms: string | null
  default_validity_days: number
  notify_on_view: boolean
  notify_on_accept: boolean
  notify_on_decline: boolean
  created_at: string
  updated_at: string
}

export async function getCompanySettings(
  supabase: SupabaseClient,
  userId: string
): Promise<CompanySettings | null> {
  const { data } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', userId)
    .single()

  return (data as CompanySettings) ?? null
}
