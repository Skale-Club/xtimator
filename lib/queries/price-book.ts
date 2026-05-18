import type { SupabaseClient } from '@supabase/supabase-js'

export interface PriceBookItem {
  id: string
  company_id: string
  category: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
  created_at: string
  image_url: string | null
}

export async function getPriceBookItems(
  supabase: SupabaseClient,
  companyId: string
): Promise<PriceBookItem[]> {
  const { data } = await supabase
    .from('company_price_book')
    .select('id, company_id, category, name, unit, unit_price, notes, created_at, image_url')
    .eq('company_id', companyId)
    .order('category')
    .order('name')
  return (data as PriceBookItem[]) ?? []
}
