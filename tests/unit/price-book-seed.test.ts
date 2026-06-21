import { describe, it, expect } from 'vitest'
import { buildMergedFolders } from '@/lib/price-book-seed'

describe('buildMergedFolders', () => {
  it('returns the folders for a single industry', () => {
    const folders = buildMergedFolders(['house_cleaning'])
    expect(folders.length).toBeGreaterThan(0)
    // Every folder has a name and at least one item.
    for (const f of folders) {
      expect(f.name).toBeTruthy()
      expect(f.items.length).toBeGreaterThan(0)
    }
  })

  it('does NOT double-seed the legacy "cleaning" alias of house_cleaning', () => {
    const single = buildMergedFolders(['house_cleaning'])
    const withAlias = buildMergedFolders(['house_cleaning', 'cleaning'])
    expect(withAlias.length).toBe(single.length)
  })

  it('merges folders from multiple distinct industries with unique names', () => {
    const houseOnly = buildMergedFolders(['house_cleaning'])
    const windowOnly = buildMergedFolders(['window_cleaning'])
    const merged = buildMergedFolders(['house_cleaning', 'window_cleaning'])

    expect(merged.length).toBe(houseOnly.length + windowOnly.length)
    const names = merged.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('skips unknown industry ids', () => {
    expect(buildMergedFolders(['not_a_real_industry'])).toEqual([])
  })

  it('returns an empty array for no industries', () => {
    expect(buildMergedFolders([])).toEqual([])
  })
})
