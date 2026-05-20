/**
 * Phase 76 PB-CSV-05: Deterministic dedupe resolver for CSV import.
 *
 * Compares incoming rows against existing price-book rows using a
 * case-insensitive `(folder_name, name)` key and applies a global strategy
 * (with optional per-row override) to produce 3 disjoint outputs:
 *   - toInsert: rows that will create new price-book items
 *   - toUpdate: rows that overwrite an existing item's unit/unit_price/notes
 *   - skippedCount: rows that collided under the 'skip' strategy
 */

export type DedupeStrategy = 'skip' | 'update' | 'new'

export interface PriceBookExistingRow {
  id: string
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
}

export interface IncomingRow {
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
  /** Per-row override of the global strategy. */
  strategyOverride?: DedupeStrategy
}

export interface DedupeInsert {
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
}

export interface DedupeUpdate {
  id: string
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
}

export interface DedupeResult {
  toInsert: DedupeInsert[]
  toUpdate: DedupeUpdate[]
  skippedCount: number
}

export interface DedupeInput {
  existing: PriceBookExistingRow[]
  incoming: IncomingRow[]
  global: DedupeStrategy
}

const keyOf = (folder: string | null | undefined, name: string): string =>
  `${(folder ?? '').toLowerCase()}::${name.toLowerCase()}`

function suffixUntilFree(name: string, takenLower: Set<string>): string {
  let n = 2
  let candidate = `${name} (${n})`
  while (takenLower.has(candidate.toLowerCase())) {
    n++
    candidate = `${name} (${n})`
  }
  return candidate
}

export function applyDedupeStrategy(input: DedupeInput): DedupeResult {
  const toInsert: DedupeInsert[] = []
  const toUpdate: DedupeUpdate[] = []
  let skippedCount = 0

  // Index existing rows by case-insensitive (folder, name) key and by folder
  // for suffix-collision avoidance.
  const existingByKey = new Map<string, PriceBookExistingRow>()
  const namesByFolder = new Map<string, Set<string>>()
  for (const row of input.existing) {
    existingByKey.set(keyOf(row.folder_name, row.name), row)
    const folderKey = (row.folder_name ?? '').toLowerCase()
    if (!namesByFolder.has(folderKey)) namesByFolder.set(folderKey, new Set())
    namesByFolder.get(folderKey)!.add(row.name.toLowerCase())
  }

  for (const row of input.incoming) {
    const key = keyOf(row.folder_name, row.name)
    const collision = existingByKey.get(key)
    const strategy = row.strategyOverride ?? input.global

    if (!collision) {
      // No collision — always insert regardless of strategy.
      toInsert.push({
        folder_name: row.folder_name,
        name: row.name,
        unit: row.unit,
        unit_price: row.unit_price,
        notes: row.notes,
      })
      // Track for in-batch suffix collisions (e.g. two 'new' rows in a row).
      const folderKey = (row.folder_name ?? '').toLowerCase()
      if (!namesByFolder.has(folderKey)) namesByFolder.set(folderKey, new Set())
      namesByFolder.get(folderKey)!.add(row.name.toLowerCase())
      continue
    }

    if (strategy === 'skip') {
      skippedCount++
      continue
    }

    if (strategy === 'update') {
      toUpdate.push({
        id: collision.id,
        folder_name: row.folder_name,
        name: row.name,
        unit: row.unit,
        unit_price: row.unit_price,
        notes: row.notes,
      })
      continue
    }

    // 'new' — assign unique suffix within folder.
    const folderKey = (row.folder_name ?? '').toLowerCase()
    if (!namesByFolder.has(folderKey)) namesByFolder.set(folderKey, new Set())
    const taken = namesByFolder.get(folderKey)!
    const finalName = suffixUntilFree(row.name, taken)
    taken.add(finalName.toLowerCase())
    toInsert.push({
      folder_name: row.folder_name,
      name: finalName,
      unit: row.unit,
      unit_price: row.unit_price,
      notes: row.notes,
    })
  }

  return { toInsert, toUpdate, skippedCount }
}
