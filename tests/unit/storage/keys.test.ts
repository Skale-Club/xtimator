/**
 * Phase 66 Plan 01 — Wave 0 contract tests for buildStorageKey (STORAGE-04).
 *
 * Enforces the S3-friendly convention `{companyId}/{type}/{timestamp}-{filename}`.
 * Sanitization mirrors lib/whatsapp/pdf-delivery.ts buildPdfFilename — strip
 * characters outside [a-zA-Z0-9._-] and collapse whitespace to hyphens.
 *
 * Security Review S04: companyId must be a UUID and type must be ascii-safe so
 * neither can escape the tenant prefix.
 */
import { describe, it, expect } from 'vitest'

import { buildStorageKey } from '@/lib/storage/keys'

const CO = '11111111-1111-4111-8111-111111111111'

describe('buildStorageKey (STORAGE-04)', () => {
  it('produces {companyId}/{type}/{timestamp}-{filename}', () => {
    const key = buildStorageKey({ companyId: CO, type: 'photos', filename: 'shot.jpg' })
    expect(key).toMatch(new RegExp(`^${CO}/photos/\\d+-shot\\.jpg$`))
  })

  it('collapses whitespace in filename to hyphens', () => {
    const key = buildStorageKey({
      companyId: CO,
      type: 'audio',
      filename: 'my recording.webm',
      timestamp: 1700000000000,
    })
    expect(key).toBe(`${CO}/audio/1700000000000-my-recording.webm`)
  })

  it('strips unsafe characters from filename (keeps alphanumerics, dot, underscore, hyphen)', () => {
    const key = buildStorageKey({
      companyId: CO,
      type: 'photos',
      filename: "O'Brien & Sons!.jpg",
      timestamp: 1700000000000,
    })
    // Apostrophes, ampersands, and exclamation marks are stripped; spaces collapse to hyphens.
    expect(key).toBe(`${CO}/photos/1700000000000-OBrien--Sons.jpg`)
  })

  it('accepts optional explicit timestamp for deterministic test output', () => {
    const key = buildStorageKey({
      companyId: CO,
      type: 'whatsapp-pdf',
      filename: 'estimate.pdf',
      timestamp: 1234567890,
    })
    expect(key).toBe(`${CO}/whatsapp-pdf/1234567890-estimate.pdf`)
  })

  it('uses Date.now() when no timestamp is provided', () => {
    const before = Date.now()
    const key = buildStorageKey({ companyId: CO, type: 'logo', filename: 'logo.png' })
    const after = Date.now()

    const match = key.match(new RegExp(`^${CO}/logo/(\\d+)-logo\\.png$`))
    expect(match).not.toBeNull()
    const ts = Number(match![1])
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('keeps a valid type segment verbatim', () => {
    const key = buildStorageKey({
      companyId: CO,
      type: 'refine-photos',
      filename: 'a.jpg',
      timestamp: 1,
    })
    expect(key).toBe(`${CO}/refine-photos/1-a.jpg`)
  })

  // Security Review S04 — tenant-prefix escape hardening.
  it('rejects a non-UUID companyId (path-traversal attempt)', () => {
    expect(() =>
      buildStorageKey({ companyId: '../other-co', type: 'photos', filename: 'a.jpg' })
    ).toThrow(/companyId must be a UUID/)
  })

  it('rejects a short/legacy non-UUID companyId', () => {
    expect(() =>
      buildStorageKey({ companyId: 'co', type: 'photos', filename: 'a.jpg' })
    ).toThrow(/companyId must be a UUID/)
  })

  it('rejects a type segment containing a slash', () => {
    expect(() =>
      buildStorageKey({ companyId: CO, type: '../escape', filename: 'a.jpg' })
    ).toThrow(/type must match/)
  })
})
