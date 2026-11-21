import { describe, it, expect } from 'vitest'
import { isOwnedStoragePath } from '@/lib/storage/owned-path'

describe('isOwnedStoragePath', () => {
  const c = 'company-1'
  it('accepts a normal key under the company folder', () => {
    expect(isOwnedStoragePath('company-1/proj-1/rec.webm', c)).toBe(true)
    expect(isOwnedStoragePath('company-1/rec.mp4', c)).toBe(true)
  })
  it('rejects another company, a bare prefix and non-strings', () => {
    expect(isOwnedStoragePath('company-2/rec.webm', c)).toBe(false)
    expect(isOwnedStoragePath('company-1/', c)).toBe(false)
    expect(isOwnedStoragePath('company-10/rec.webm', c)).toBe(false)
    expect(isOwnedStoragePath(undefined, c)).toBe(false)
  })
  it('rejects traversal, backslashes, a leading slash after the prefix and NUL', () => {
    expect(isOwnedStoragePath('company-1/../company-2/rec.webm', c)).toBe(false)
    expect(isOwnedStoragePath('company-1/a/../../company-2/rec.webm', c)).toBe(false)
    expect(isOwnedStoragePath('company-1/a\\..\\b.webm', c)).toBe(false)
    expect(isOwnedStoragePath('company-1//rec.webm', c)).toBe(false)
    expect(isOwnedStoragePath('company-1/rec\0.webm', c)).toBe(false)
  })
  it('does not reject a file name that merely contains two dots', () => {
    expect(isOwnedStoragePath('company-1/rec..final.webm', c)).toBe(true)
  })
})
