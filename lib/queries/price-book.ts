import type { SupabaseClient } from '@supabase/supabase-js'
import type { AreaSize } from '@/lib/schemas/price-book'

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
  currency_code?: string
  folder_id: string | null
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
  created_at: string
  image_url: string | null
  pricing_type: 'fixed' | 'area_based' | 'base_plus_addons'
  base_price: number | null
  price_per_unit: number | null
  minimum_price: number | null
  area_sizes: AreaSize[] | null
}

export async function getPriceBookItems(
  supabase: SupabaseClient,
  companyId: string
): Promise<PriceBookItem[]> {
  const { data } = await supabase
    .from('company_price_book')
    .select(`
      id, company_id, currency_code, folder_id, name, unit, unit_price, notes, created_at, image_url,
      pricing_type, base_price, price_per_unit, minimum_price, area_sizes,
      price_book_folders ( name )
    `)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    folder_name: (row.price_book_folders as { name: string } | null)?.name ?? null,
    price_book_folders: undefined,
  })) as PriceBookItem[]
}

// --- Trash (quick-260718-t7d) ---

export interface DeletedPriceBookItem extends PriceBookItem {
  deleted_at: string
}

export async function getDeletedPriceBookItems(
  supabase: SupabaseClient,
  companyId: string
): Promise<DeletedPriceBookItem[]> {
  const { data } = await supabase
    .from('company_price_book')
    .select(`
      id, company_id, currency_code, folder_id, name, unit, unit_price, notes, created_at, image_url,
      pricing_type, base_price, price_per_unit, minimum_price, area_sizes, deleted_at,
      price_book_folders ( name )
    `)
    .eq('company_id', companyId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    folder_name: (row.price_book_folders as { name: string } | null)?.name ?? null,
    price_book_folders: undefined,
  })) as DeletedPriceBookItem[]
}

// --- PriceBookItemOption ---

export interface PriceBookItemOption {
  id: string
  item_id: string
  company_id: string
  name: string
  price: number
  max_quantity: number | null
  sort_order: number
  created_at: string
}

export async function getItemOptions(
  supabase: SupabaseClient,
  itemId: string
): Promise<PriceBookItemOption[]> {
  const { data } = await supabase
    .from('price_book_item_options')
    .select('id, item_id, company_id, name, price, max_quantity, sort_order, created_at')
    .eq('item_id', itemId)
    .order('sort_order')
    .order('created_at')
  return (data as PriceBookItemOption[]) ?? []
}
