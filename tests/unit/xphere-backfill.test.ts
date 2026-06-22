import { describe, it, expect } from 'vitest'
import { chunkEventBatches } from '@/app/api/admin/xphere-backfill/route'

describe('XPHERE-B6 chunkEventBatches', () => {
  it('Test 1: chunks ["a","b","c"] size 2 → [[a,b],[c]]', () => {
    const chunks = chunkEventBatches(['a', 'b', 'c'], 2)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(2)
    expect(chunks[1]).toHaveLength(1)
  })

  it('Test 2: every event is xphere/sync.requested with data.event company.updated', () => {
    const chunks = chunkEventBatches(['a', 'b', 'c'], 2)
    for (const chunk of chunks) {
      for (const ev of chunk) {
        expect(ev.name).toBe('xphere/sync.requested')
        expect(ev.data.event).toBe('company.updated')
      }
    }
  })

  it('Test 3: empty input → []', () => {
    expect(chunkEventBatches([], 100)).toEqual([])
  })

  it('Test 4: total events across chunks === companyIds.length', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const chunks = chunkEventBatches(ids, 2)
    const total = chunks.reduce((n, c) => n + c.length, 0)
    expect(total).toBe(ids.length)
  })
})
