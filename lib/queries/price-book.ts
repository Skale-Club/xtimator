import type { SupabaseClient } from '@supabase/supabase-js'

// --- PriceBookFolder ---

export interface PriceBookFolder {
  id: string
  company_id: string
  name: string
  sort_order: number
  created_at: string
}

export async function getFolders(
  supabase: SupabaseClient,
  companyId: string
): Promise<PriceBookFolder[]> {
  const { data } = await supabase
    .from('price_book_folders')
    .select('id, company_id, name, sort_order, created_at')
    .eq('company_id', companyId)
    .order('sort_order')
    .order('name')
  return (data as PriceBookFolder[]) ?? []
}

// --- PriceBookItem ---

export interface PriceBookItem {
  id: string
  company_id: string
  folder_id: string | null
  folder_name: string | null
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
    .select(`
      id, company_id, folder_id, category, name, unit, unit_price, notes, created_at, image_url,
      price_book_folders ( name )
    `)
    .eq('company_id', companyId)
    .order('category')
    .order('name')
  // Flatten the nested join: price_book_folders.name → folder_name
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    folder_name: (row.price_book_folders as { name: string } | null)?.name ?? null,
    price_book_folders: undefined,
  })) as PriceBookItem[]
}
