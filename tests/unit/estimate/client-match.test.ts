import { describe, expect, it } from 'vitest'
import { findUniqueClientMatch } from '@/lib/estimate/client-match'

describe('findUniqueClientMatch', () => {
  it('returns the only exact match after normalizing case, punctuation and whitespace', () => {
    const client = { id: 'client-1', name: 'Maria F Alves' }
    const clients = Object.freeze([client, { id: 'client-2', name: 'Maria F Alves Jr.' }])

    expect(findUniqueClientMatch('  MARIA\t F. Alves,  ', clients)).toBe(client)
  })

  it('returns null when multiple saved clients share the normalized name', () => {
    const clients = [
      { id: 'client-1', name: 'J. Smith' },
      { id: 'client-2', name: '. j   smith,' },
    ]

    expect(findUniqueClientMatch('J Smith', clients)).toBeNull()
    expect(findUniqueClientMatch('J Smith', [...clients].reverse())).toBeNull()
  })

  it.each(['', '\t  ', '., .'])('rejects a detected name that normalizes to empty (%j)', (name) => {
    expect(findUniqueClientMatch(name, [{ id: 'client-1', name: '., .' }])).toBeNull()
  })

  it('requires the full normalized name', () => {
    const clients = [{ id: 'client-1', name: 'Maria F Alves' }]

    expect(findUniqueClientMatch('Alves', clients)).toBeNull()
    expect(findUniqueClientMatch('Maria Alves', clients)).toBeNull()
    expect(findUniqueClientMatch('Maria F Alves', [])).toBeNull()
  })
})
