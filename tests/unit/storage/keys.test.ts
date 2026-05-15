/**
 * Phase 66 Plan 01 — Wave 0 contract tests for buildStorageKey (STORAGE-04).
 *
 * Enforces the S3-friendly convention `{companyId}/{type}/{timestamp}-{filename}`.
 * Sanitization mirrors lib/whatsapp/pdf-delivery.ts buildPdfFilename — strip
 * characters outside [a-zA-Z0-9._-] and collapse whitespace to hyphens.
 */
import { describe, it, expect } from 'vitest'

// Module does not exist yet — RED state is intentional.
import { buildStorageKey } from '@/lib/storage/keys'

describe('buildStorageKey (STORAGE-04)', () => {
  it('produces {companyId}/{type}/{timestamp}-{filename}', () => {
    const key = buildStorageKey({ companyId: 'abc', type: 'photos', filename: 'shot.jpg' })
    expect(key).toMatch(/^abc\/photos\/\d+-shot\.jpg$/)
  })

  it('collapses whitespace in filename to hyphens', () => {
    const key = buildStorageKey({
      companyId: 'co',
      type: 'audio',
      filename: 'my recording.webm',
      timestamp: 1700000000000,
    })
    expect(key).toBe('co/audio/1700000000000-my-recording.webm')
  })

  it('strips unsafe characters from filename (keeps alphanumerics, dot, underscore, hyphen)', () => {
    const key = buildStorageKey({
      companyId: 'co',
      type: 'photos',
      filename: "O'Brien & Sons!.jpg",
      timestamp: 1700000000000,
    })
    // Apostrophes, ampersands, and exclamation marks are stripped; spaces collapse to hyphens.
    expect(key).toBe('co/photos/1700000000000-OBrien--Sons.jpg')
  })

  it('accepts optional explicit timestamp for deterministic test output', () => {
    const key = buildStorageKey({
      companyId: 'company-123',
      type: 'whatsapp-pdf',
      filename: 'estimate.pdf',
      timestamp: 1234567890,
    })
    expect(key).toBe('company-123/whatsapp-pdf/1234567890-estimate.pdf')
  })

  it('uses Date.now() when no timestamp is provided', () => {
    const before = Date.now()
    const key = buildStorageKey({ companyId: 'co', type: 'logo', filename: 'logo.png' })
    const after = Date.now()

    const match = key.match(/^co\/logo\/(\d+)-logo\.png$/)
    expect(match).not.toBeNull()
    const ts = Number(match![1])
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('preserves the type segment verbatim (does not sanitize it — caller controls)', () => {
    const key = buildStorageKey({
      companyId: 'co',
      type: 'refine-photos',
      filename: 'a.jpg',
      timestamp: 1,
    })
    expect(key).toBe('co/refine-photos/1-a.jpg')
  })
})
