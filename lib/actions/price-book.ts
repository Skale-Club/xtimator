'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { priceBookItemSchema, type PriceBookItemFormValues } from '@/lib/schemas/price-book'
import { createStorage, buildStorageKey } from '@/lib/storage'
import {
  applyDedupeStrategy,
  type DedupeStrategy,
  type IncomingRow,
  type PriceBookExistingRow,
} from '@/lib/csv/dedupe'
import type { ImportRow } from '@/lib/csv/price-book-import'
import { getActiveCompanyId } from '@/lib/queries/active-company'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id, currency_code')
    .eq('id', activeCompanyId)
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
      currency_code: company.currency_code,
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
        currency_code: company.currency_code,
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
    .select('id, company_id, currency_code, folder_id, name, unit, unit_price, notes')
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
    id: string; company_id: string; currency_code: string; folder_id: string | null;
    name: string; unit: string | null; unit_price: number; notes: string | null
  }[]).map((item) => ({
    id: item.id,
    company_id: item.company_id,
    currency_code: item.currency_code,
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

// ── Phase 76: chunked import + undo ────────────────────────────────────────

export interface CommitChunkInput {
  /** Already validated + edited on client (one chunk slice, ≤50 rows). */
  rows: ImportRow[]
  globalStrategy: DedupeStrategy
  /** rowNumber → strategy. rowNumber is 1-based index within `rows`. */
  perRowOverrides: Record<number, DedupeStrategy>
  /** Optional pre-resolved folder name → folder_id map (lowercased keys). */
  folderNameMap?: Record<string, string>
  chunkIndex: number
  totalChunks: number
  /** Present on chunks 1..N — server returns it after chunk 0. */
  importId?: string
  filename: string
  locale: string
  /** If true, no DB writes. Returns the planned counts only. */
  dryRun?: boolean
}

export interface CommitChunkFailedRow {
  rowNumber: number
  values: ImportRow
  reason: string
}

export interface CommitChunkResult {
  importId: string
  chunkIndex: number
  totalChunks: number
  insertedCount: number
  updatedCount: number
  skippedCount: number
  failedRows: CommitChunkFailedRow[]
  done: boolean
}

interface PrevStateSnap {
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
}

/**
 * Phase 76 PB-CSV-06/07/08: Commit one chunk of an import.
 *
 * - Resolves any missing folders for this chunk (tracked in `inserted_folder_ids`)
 * - Runs `applyDedupeStrategy` against existing company items
 * - Inserts/updates rows respecting the chunk's strategies
 * - On chunk 0 inserts a `price_book_imports` row to seed the undo ledger
 * - On chunks 1..N merges results into the existing import row
 * - On the final chunk, revalidates `/price-book`
 */
export async function commitImportChunk(
  input: CommitChunkInput,
): Promise<{ data: CommitChunkResult } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx

  const { data: claimsData } = await supabase.auth.getClaims()
  const actorId = claimsData?.claims?.sub
  if (!actorId) return { error: 'Not authenticated' }

  // 1. Resolve folders — start from caller-supplied map, add anything missing.
  const folderNames = [
    ...new Set(
      input.rows
        .map((r) => r.folder_name)
        .filter((n): n is string => !!n && n.trim().length > 0),
    ),
  ]
  const folderMap = new Map<string, string>(
    Object.entries(input.folderNameMap ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  )
  const insertedFolderIds: string[] = []
  if (folderNames.length > 0 && !input.dryRun) {
    const missing = folderNames.filter((n) => !folderMap.has(n.toLowerCase()))
    if (missing.length > 0) {
      // Track which folder names are brand-new (resolveOrCreateFolders is idempotent
      // and merges existing+created, so we diff afterwards via a pre-check).
      const { data: preExisting } = await supabase
        .from('price_book_folders')
        .select('name')
        .eq('company_id', company.id)
        .in('name', missing)
      const preExistingLower = new Set(
        (preExisting ?? []).map((r: { name: string }) => r.name.toLowerCase()),
      )

      const resolved = await resolveOrCreateFolders(missing)
      if ('error' in resolved) return { error: resolved.error }
      for (const [lowerName, id] of resolved.data) {
        if (!folderMap.has(lowerName)) {
          folderMap.set(lowerName, id)
          if (!preExistingLower.has(lowerName)) insertedFolderIds.push(id)
        }
      }
    }
  }

  // 2. Fetch existing items (full row) and shape into PriceBookExistingRow.
  const { data: existingItems, error: exErr } = await supabase
    .from('company_price_book')
    .select('id, folder_id, name, unit, unit_price, notes')
    .eq('company_id', company.id)
  if (exErr) return { error: 'Could not load existing items.' }

  const folderIdToName = new Map<string, string>()
  for (const [lowerName, id] of folderMap) folderIdToName.set(id, lowerName)

  const existingForDedupe: PriceBookExistingRow[] = (existingItems ?? []).map(
    (e: {
      id: string
      folder_id: string | null
      name: string
      unit: string | null
      unit_price: number
      notes: string | null
    }) => ({
      id: e.id,
      folder_name: e.folder_id ? folderIdToName.get(e.folder_id) ?? null : null,
      name: e.name,
      unit: e.unit,
      unit_price: e.unit_price,
      notes: e.notes,
    }),
  )

  // Index existing items by id for prev_state snapshot lookup.
  const existingById = new Map<string, (typeof existingForDedupe)[number]>()
  for (const e of existingForDedupe) existingById.set(e.id, e)

  // 3. Build IncomingRow[] honoring per-row overrides (rowNumber === 1-based idx).
  const incoming: IncomingRow[] = input.rows.map((r, i) => ({
    folder_name: r.folder_name ?? null,
    name: r.name,
    unit: r.unit ?? null,
    unit_price: r.unit_price,
    notes: r.notes ?? null,
    strategyOverride: input.perRowOverrides[i + 1],
  }))

  const dedupe = applyDedupeStrategy({
    existing: existingForDedupe,
    incoming,
    global: input.globalStrategy,
  })

  const insertedItemIds: string[] = []
  const updatedItemIds: string[] = []
  const prevState: Record<string, PrevStateSnap> = {}
  const failedRows: CommitChunkFailedRow[] = []
  let insertedCount = 0
  let updatedCount = 0
  const skippedCount = dedupe.skippedCount

  if (!input.dryRun) {
    // 4. Insert chunk (caller-enforced ≤50 rows).
    if (dedupe.toInsert.length > 0) {
      const payload = dedupe.toInsert.map((row) => ({
        company_id: company.id,
        currency_code: company.currency_code,
        folder_id: row.folder_name ? folderMap.get(row.folder_name.toLowerCase()) ?? null : null,
        name: row.name,
        unit: row.unit || null,
        unit_price: row.unit_price,
        notes: row.notes || null,
      }))
      const { data: inserted, error: insErr } = await supabase
        .from('company_price_book')
        .insert(payload)
        .select('id')
      if (insErr) {
        for (const row of dedupe.toInsert) {
          failedRows.push({
            rowNumber: 0,
            values: {
              folder_name: row.folder_name ?? undefined,
              name: row.name,
              unit: row.unit ?? '',
              unit_price: row.unit_price,
              notes: row.notes ?? '',
            } as ImportRow,
            reason: `Insert failed: ${insErr.message}`,
          })
        }
      } else {
        insertedCount = inserted?.length ?? 0
        for (const r of inserted ?? []) insertedItemIds.push(r.id)
      }
    }

    // 5. Apply updates per-row (different values per row → can't batch).
    for (const u of dedupe.toUpdate) {
      const prev = existingById.get(u.id)
      if (prev) {
        prevState[u.id] = {
          name: prev.name,
          unit: prev.unit,
          unit_price: prev.unit_price,
          notes: prev.notes,
        }
      }
      const { error: updErr } = await supabase
        .from('company_price_book')
        .update({
          unit: u.unit || null,
          unit_price: u.unit_price,
          notes: u.notes || null,
        })
        .eq('id', u.id)
        .eq('company_id', company.id)
      if (updErr) {
        failedRows.push({
          rowNumber: 0,
          values: {
            folder_name: u.folder_name ?? undefined,
            name: u.name,
            unit: u.unit ?? '',
            unit_price: u.unit_price,
            notes: u.notes ?? '',
          } as ImportRow,
          reason: `Update failed: ${updErr.message}`,
        })
      } else {
        updatedCount++
        updatedItemIds.push(u.id)
      }
    }
  }

  // 6. Record / merge into price_book_imports for the undo ledger.
  const isFirstChunk = input.chunkIndex === 0
  const done = input.chunkIndex === input.totalChunks - 1
  let importId = input.importId

  if (!input.dryRun) {
    if (isFirstChunk) {
      const { data: imp, error: impErr } = await supabase
        .from('price_book_imports')
        .insert({
          company_id: company.id,
          actor_id: actorId,
          inserted_item_ids: insertedItemIds,
          updated_item_ids: updatedItemIds,
          inserted_folder_ids: insertedFolderIds,
          prev_state: prevState as unknown as Record<string, unknown>,
          summary: {
            filename: input.filename,
            locale: input.locale,
            inserted: insertedCount,
            updated: updatedCount,
            skipped: skippedCount,
            failed: failedRows.length,
          },
        })
        .select('id')
        .single()
      if (impErr || !imp) return { error: 'Could not record import for undo.' }
      importId = imp.id
    } else if (importId) {
      const { data: existingImp } = await supabase
        .from('price_book_imports')
        .select('inserted_item_ids, updated_item_ids, inserted_folder_ids, prev_state, summary')
        .eq('id', importId)
        .eq('company_id', company.id)
        .single()
      if (existingImp) {
        const priorSummary = (existingImp.summary ?? {}) as {
          inserted?: number
          updated?: number
          skipped?: number
          failed?: number
          filename?: string
          locale?: string
        }
        const priorPrev = (existingImp.prev_state ?? {}) as Record<string, PrevStateSnap>
        const merged = {
          inserted_item_ids: [...(existingImp.inserted_item_ids ?? []), ...insertedItemIds],
          updated_item_ids: [...(existingImp.updated_item_ids ?? []), ...updatedItemIds],
          inserted_folder_ids: [
            ...(existingImp.inserted_folder_ids ?? []),
            ...insertedFolderIds,
          ],
          prev_state: { ...priorPrev, ...prevState } as unknown as Record<string, unknown>,
          summary: {
            ...priorSummary,
            inserted: (priorSummary.inserted ?? 0) + insertedCount,
            updated: (priorSummary.updated ?? 0) + updatedCount,
            skipped: (priorSummary.skipped ?? 0) + skippedCount,
            failed: (priorSummary.failed ?? 0) + failedRows.length,
          },
        }
        await supabase
          .from('price_book_imports')
          .update(merged)
          .eq('id', importId)
          .eq('company_id', company.id)
      }
    }
    if (done) revalidatePath('/price-book')
  }

  return {
    data: {
      importId: importId ?? 'dry-run',
      chunkIndex: input.chunkIndex,
      totalChunks: input.totalChunks,
      insertedCount,
      updatedCount,
      skippedCount,
      failedRows,
      done,
    },
  }
}

export interface UndoResult {
  removedItems: number
  removedFolders: number
  revertedItems: number
}

/**
 * Phase 76 PB-CSV-07: Reverse the most recent import.
 *
 * - Eligibility gated server-side to a 5-minute window from `created_at`
 * - Deletes rows in `inserted_item_ids` (created by the import)
 * - Restores prior `name/unit/unit_price/notes` for rows in `updated_item_ids`
 *   using the `prev_state` JSONB snapshot
 * - Deletes folders in `inserted_folder_ids` only if they are now empty
 * - Removes the import ledger row after reversal
 */
export async function undoLastImport(
  importId: string,
): Promise<{ data: UndoResult } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx

  const { data: imp, error: impErr } = await supabase
    .from('price_book_imports')
    .select(
      'id, company_id, created_at, inserted_item_ids, updated_item_ids, inserted_folder_ids, prev_state',
    )
    .eq('id', importId)
    .eq('company_id', company.id)
    .single()
  if (impErr || !imp) return { error: 'Import not found.' }

  const createdMs = new Date(imp.created_at).getTime()
  if (Date.now() - createdMs > 5 * 60 * 1000) {
    return { error: 'Undo window expired (5 minutes).' }
  }

  let removedItems = 0
  let revertedItems = 0
  let removedFolders = 0

  // 1. Delete inserted items.
  if (imp.inserted_item_ids && imp.inserted_item_ids.length > 0) {
    const { error: delErr, count } = await supabase
      .from('company_price_book')
      .delete({ count: 'exact' })
      .in('id', imp.inserted_item_ids)
      .eq('company_id', company.id)
    if (delErr) return { error: 'Could not remove inserted items.' }
    removedItems = count ?? 0
  }

  // 2. Revert updated items from prev_state.
  const prev = (imp.prev_state ?? {}) as Record<string, PrevStateSnap>
  for (const id of imp.updated_item_ids ?? []) {
    const snap = prev[id]
    if (!snap) continue
    const { error: revErr } = await supabase
      .from('company_price_book')
      .update({
        name: snap.name,
        unit: snap.unit,
        unit_price: snap.unit_price,
        notes: snap.notes,
      })
      .eq('id', id)
      .eq('company_id', company.id)
    if (!revErr) revertedItems++
  }

  // 3. Delete folders created by this import — only if empty.
  if (imp.inserted_folder_ids && imp.inserted_folder_ids.length > 0) {
    for (const fId of imp.inserted_folder_ids) {
      const { count: itemCount } = await supabase
        .from('company_price_book')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('folder_id', fId)
      if ((itemCount ?? 0) === 0) {
        const { error: delErr } = await supabase
          .from('price_book_folders')
          .delete()
          .eq('id', fId)
          .eq('company_id', company.id)
        if (!delErr) removedFolders++
      }
    }
  }

  // 4. Drop the ledger row so it doesn't show as undoable any more.
  await supabase
    .from('price_book_imports')
    .delete()
    .eq('id', importId)
    .eq('company_id', company.id)

  revalidatePath('/price-book')
  return { data: { removedItems, removedFolders, revertedItems } }
}

/**
 * Phase 76 PB-CSV-07: Lookup helper for the /price-book Undo button.
 * Returns the most recent import within the 5-minute window, or null.
 */
export async function getRecentUndoableImport(): Promise<
  | { data: { id: string; createdAt: string; summary: Record<string, unknown> } | null }
  | { error: string }
> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('price_book_imports')
    .select('id, created_at, summary')
    .eq('company_id', company.id)
    .gt('created_at', fiveMinAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { error: 'Could not load recent imports.' }
  if (!data) return { data: null }
  return {
    data: {
      id: data.id,
      createdAt: data.created_at,
      summary: (data.summary ?? {}) as Record<string, unknown>,
    },
  }
}
