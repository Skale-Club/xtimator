'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { priceBookItemSchema, type PriceBookItemFormValues } from '@/lib/schemas/price-book'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company }
}

export async function createPriceBookItem(formData: PriceBookItemFormValues) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data, error } = await supabase
    .from('company_price_book')
    .insert({
      company_id: company.id,
      category: formData.category,
      name: formData.name,
      unit: formData.unit || null,
      unit_price: formData.unit_price,
      notes: formData.notes || null,
    })
    .select()
    .single()

  if (error) return { error: 'Failed to create item. Please try again.' }

  revalidatePath('/settings/price-book')
  return { data }
}

export async function updatePriceBookItem(
  itemId: string,
  formData: PriceBookItemFormValues
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { data, error } = await supabase
    .from('company_price_book')
    .update({
      category: formData.category,
      name: formData.name,
      unit: formData.unit || null,
      unit_price: formData.unit_price,
      notes: formData.notes || null,
    })
    .eq('id', itemId)
    .select()
    .single()

  if (error) return { error: 'Failed to update item. Please try again.' }

  revalidatePath('/settings/price-book')
  return { data }
}

export async function deletePriceBookItem(itemId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('company_price_book')
    .delete()
    .eq('id', itemId)

  if (error) return { error: 'Failed to delete item. Please try again.' }

  revalidatePath('/settings/price-book')
  return { data: { deleted: true } }
}

export async function importPriceBookItems(
  rows: PriceBookItemFormValues[]
): Promise<
  | { data: { imported: number; skipped: number } }
  | { error: string }
> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx

  // Server-side re-validate every row (defense in depth)
  const validatedRows: PriceBookItemFormValues[] = []
  for (const row of rows) {
    const result = priceBookItemSchema.safeParse(row)
    if (result.success) validatedRows.push(result.data)
  }
  if (validatedRows.length === 0) {
    return { error: 'No valid rows to import.' }
  }

  // Fetch existing (category, name) pairs for the company — one query
  const { data: existing, error: existingErr } = await supabase
    .from('company_price_book')
    .select('category, name')
    .eq('company_id', company.id)
  if (existingErr) {
    return { error: 'Could not check for duplicates. Please try again.' }
  }

  const existingKeys = new Set(
    (existing ?? []).map((r: { category: string; name: string }) =>
      `${r.category.toLowerCase()}::${r.name.toLowerCase()}`
    )
  )

  const toInsert = validatedRows.filter((r) => {
    const key = `${r.category.toLowerCase()}::${r.name.toLowerCase()}`
    return !existingKeys.has(key)
  })
  const skipped = validatedRows.length - toInsert.length

  if (toInsert.length === 0) {
    return { data: { imported: 0, skipped } }
  }

  const { error: insertErr } = await supabase
    .from('company_price_book')
    .insert(
      toInsert.map((r) => ({
        company_id: company.id,
        category: r.category,
        name: r.name,
        unit: r.unit || null,
        unit_price: r.unit_price,
        notes: r.notes || null,
      }))
    )
  if (insertErr) {
    return { error: 'Failed to import items. Please try again.' }
  }

  revalidatePath('/settings/price-book')
  return { data: { imported: toInsert.length, skipped } }
}

export async function bulkAdjustPriceBookCategory(
  category: string,
  adjustmentPercent: number
): Promise<{ data: { updated: number } } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx

  // Fetch all items in the category for this company (full row for upsert)
  const { data: items, error: fetchErr } = await supabase
    .from('company_price_book')
    .select('id, company_id, category, name, unit, unit_price, notes')
    .eq('company_id', company.id)
    .eq('category', category)

  if (fetchErr || !items || items.length === 0) {
    return { error: 'No items found in that category.' }
  }

  // D-04: Round to 2 decimal places (NUMERIC(12,2) in Postgres)
  const adjustedItems = (items as {
    id: string; company_id: string; category: string;
    name: string; unit: string | null; unit_price: number; notes: string | null
  }[]).map((item) => ({
    id: item.id,
    company_id: item.company_id,
    category: item.category,
    name: item.name,
    unit: item.unit,
    unit_price: Math.round(item.unit_price * (1 + adjustmentPercent / 100) * 100) / 100,
    notes: item.notes,
  }))

  // D-03: Single upsert — each row has its OWN computed unit_price (not a shared value)
  // This is atomic: PostgREST wraps upsert in a single transaction
  const { error: upsertErr } = await supabase
    .from('company_price_book')
    .upsert(adjustedItems)

  if (upsertErr) return { error: 'Failed to apply price adjustment.' }

  revalidatePath('/settings/price-book')
  return { data: { updated: adjustedItems.length } }
}
