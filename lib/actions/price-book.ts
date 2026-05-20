'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { priceBookItemSchema, type PriceBookItemFormValues } from '@/lib/schemas/price-book'
import { createStorage, buildStorageKey } from '@/lib/storage'

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

// ── Folder CRUD ────────────────────────────────────────────────

export async function createFolder(name: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const { data, error } = await supabase
    .from('price_book_folders')
    .insert({ company_id: company.id, name: name.trim() })
    .select()
    .single()
  if (error) return { error: 'Failed to create folder.' }
  revalidatePath('/price-book')
  return { data }
}

export async function updateFolder(folderId: string, name: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx
  const { error } = await supabase
    .from('price_book_folders')
    .update({ name: name.trim() })
    .eq('id', folderId)
  if (error) return { error: 'Failed to rename folder.' }
  revalidatePath('/price-book')
  return { data: { updated: true } }
}

export async function deleteFolder(folderId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  // Guard: deny delete if any items reference this folder
  const { count, error: countErr } = await supabase
    .from('company_price_book')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company.id)
    .eq('folder_id', folderId)
  if (countErr) return { error: 'Could not check folder contents.' }
  if ((count ?? 0) > 0) return { error: 'Remove all items from this folder before deleting it.' }
  const { error } = await supabase
    .from('price_book_folders')
    .delete()
    .eq('id', folderId)
  if (error) return { error: 'Failed to delete folder.' }
  revalidatePath('/price-book')
  return { data: { deleted: true } }
}

export async function resolveOrCreateFolders(
  names: string[]
): Promise<{ data: Map<string, string> } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx
  if (names.length === 0) return { data: new Map() }
  // Fetch existing
  const { data: existing } = await supabase
    .from('price_book_folders')
    .select('id, name')
    .eq('company_id', company.id)
    .in('name', names)
  const map = new Map<string, string>()
  const existingNames = new Set<string>()
  for (const row of existing ?? []) {
    map.set(row.name.toLowerCase(), row.id)
    existingNames.add(row.name.toLowerCase())
  }
  // Create missing
  const toCreate = names.filter((n) => !existingNames.has(n.toLowerCase()))
  if (toCreate.length > 0) {
    const { data: created } = await supabase
      .from('price_book_folders')
      .insert(toCreate.map((name) => ({ company_id: company.id, name })))
      .select('id, name')
    for (const row of created ?? []) {
      map.set(row.name.toLowerCase(), row.id)
    }
  }
  return { data: map }
}

// ── Item CRUD ────────────────────────────────────────────────

export async function createPriceBookItem(
  formData: PriceBookItemFormValues,
  imageFile?: File | null
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data, error } = await supabase
    .from('company_price_book')
    .insert({
      company_id: company.id,
      folder_id: formData.folder_id ?? null,
      name: formData.name,
      unit: formData.unit || null,
      unit_price: formData.unit_price,
      notes: formData.notes || null,
      image_url: formData.image_url || null,
    })
    .select()
    .single()

  if (error) return { error: 'Failed to create item. Please try again.' }

  // Upload image if provided — create-then-update pattern (Phase 03 logo)
  if (imageFile && imageFile.size > 0 && data) {
    const ext = imageFile.name.split('.').pop() ?? 'jpg'
    const key = buildStorageKey({
      companyId: company.id,
      type: 'price-book',
      filename: `${data.id}.${ext}`,
    })
    const storage = createStorage(supabase)
    try {
      await storage.upload('photos', key, imageFile, { upsert: true })
      const imageUrl = storage.getPublicUrl('photos', key)
      await supabase
        .from('company_price_book')
        .update({ image_url: imageUrl })
        .eq('id', data.id)
    } catch {
      // Non-fatal: item created, image upload failed — return item without image_url
    }
  }

  revalidatePath('/price-book')
  return { data }
}

export async function updatePriceBookItem(
  itemId: string,
  formData: PriceBookItemFormValues,
  imageFile?: File | null
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data, error } = await supabase
    .from('company_price_book')
    .update({
      folder_id: formData.folder_id ?? null,
      name: formData.name,
      unit: formData.unit || null,
      unit_price: formData.unit_price,
      notes: formData.notes || null,
      image_url: formData.image_url || null,
    })
    .eq('id', itemId)
    .select()
    .single()

  if (error) return { error: 'Failed to update item. Please try again.' }

  // Upload new image if provided
  if (imageFile && imageFile.size > 0 && data) {
    const ext = imageFile.name.split('.').pop() ?? 'jpg'
    const key = buildStorageKey({
      companyId: company.id,
      type: 'price-book',
      filename: `${itemId}.${ext}`,
    })
    const storage = createStorage(supabase)
    try {
      await storage.upload('photos', key, imageFile, { upsert: true })
      const imageUrl = storage.getPublicUrl('photos', key)
      await supabase
        .from('company_price_book')
        .update({ image_url: imageUrl })
        .eq('id', itemId)
    } catch {
      // Non-fatal — item updated, image optional
    }
  }

  revalidatePath('/price-book')
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

  revalidatePath('/price-book')
  return { data: { deleted: true } }
}

export async function importPriceBookItems(
  rows: PriceBookItemFormValues[],
  folderNameMap?: Map<string, string>
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

  // Fetch existing (folder_id, name) pairs for the company — one query
  const { data: existing, error: existingErr } = await supabase
    .from('company_price_book')
    .select('folder_id, name')
    .eq('company_id', company.id)
  if (existingErr) {
    return { error: 'Could not check for duplicates. Please try again.' }
  }

  const existingKeys = new Set(
    (existing ?? []).map((r: { folder_id: string | null; name: string }) =>
      `${(r.folder_id ?? '')}::${r.name.toLowerCase()}`
    )
  )

  const toInsert = validatedRows.filter((r) => {
    // Resolve the row's folder_id from folder_name + folderNameMap (or explicit folder_id)
    const folderName = (r as { folder_name?: string }).folder_name
    const resolvedFolderId =
      folderName && folderNameMap
        ? (folderNameMap.get(folderName.toLowerCase()) ?? r.folder_id ?? null)
        : (r.folder_id ?? null)
    const key = `${resolvedFolderId ?? ''}::${r.name.toLowerCase()}`
    if (existingKeys.has(key)) return false
    // Stash resolved folder_id back on the row so the insert step can reuse it
    ;(r as { folder_id?: string | null }).folder_id = resolvedFolderId
    return true
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
        folder_id: r.folder_id ?? null,
        name: r.name,
        unit: r.unit || null,
        unit_price: r.unit_price,
        notes: r.notes || null,
      }))
    )
  if (insertErr) {
    return { error: 'Failed to import items. Please try again.' }
  }

  revalidatePath('/price-book')
  return { data: { imported: toInsert.length, skipped } }
}

export async function bulkAdjustPriceBookFolder(
  folderId: string | null,
  adjustmentPercent: number
): Promise<{ data: { updated: number } } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx

  // Fetch all items in the folder for this company (full row for upsert).
  // folderId === null means the "Uncategorized" bucket — items with NULL folder_id.
  let query = supabase
    .from('company_price_book')
    .select('id, company_id, folder_id, name, unit, unit_price, notes')
    .eq('company_id', company.id)

  query = folderId === null
    ? query.is('folder_id', null)
    : query.eq('folder_id', folderId)

  const { data: items, error: fetchErr } = await query

  if (fetchErr || !items || items.length === 0) {
    return { error: 'No items found in that folder.' }
  }

  // D-04: Round to 2 decimal places (NUMERIC(12,2) in Postgres)
  const adjustedItems = (items as {
    id: string; company_id: string; folder_id: string | null;
    name: string; unit: string | null; unit_price: number; notes: string | null
  }[]).map((item) => ({
    id: item.id,
    company_id: item.company_id,
    folder_id: item.folder_id,
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

  revalidatePath('/price-book')
  return { data: { updated: adjustedItems.length } }
}
