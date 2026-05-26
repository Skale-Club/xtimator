// tests/unit/mcp-pagination.test.ts
// Phase 88: keyset pagination helpers for MCP read tools.

import { describe, it, expect } from 'vitest'
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '@/lib/mcp/pagination'

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a (created_at, id) tuple losslessly', () => {
    const row = { created_at: '2026-05-26T08:00:00.000Z', id: 'abc-123' }
    const cursor = encodeCursor(row)
    const decoded = decodeCursor(cursor)
    expect(decoded).toEqual(row)
  })

  it('produces a base64-encoded string (no raw JSON braces)', () => {
    const cursor = encodeCursor({ created_at: '2026-05-26T08:00:00.000Z', id: 'x' })
    expect(cursor).not.toContain('{')
    expect(cursor).not.toContain('"')
    expect(cursor).toMatch(/^[A-Za-z0-9+/=]+$/)
  })

  it('cursor payload includes both created_at and id', () => {
    const decoded = decodeCursor(encodeCursor({ created_at: 't', id: 'i' }))
    expect(decoded).toHaveProperty('created_at')
    expect(decoded).toHaveProperty('id')
  })

  it('returns null for malformed base64', () => {
    expect(decodeCursor('not-base64-!@#$')).toBeNull()
  })

  it('returns null for valid base64 that is not JSON', () => {
    const garbage = Buffer.from('hello world', 'utf8').toString('base64')
    expect(decodeCursor(garbage)).toBeNull()
  })

  it('returns null for JSON missing the id field', () => {
    const partial = Buffer.from(JSON.stringify({ created_at: 't' }), 'utf8').toString('base64')
    expect(decodeCursor(partial)).toBeNull()
  })

  it('returns null for JSON missing the created_at field', () => {
    const partial = Buffer.from(JSON.stringify({ id: 'x' }), 'utf8').toString('base64')
    expect(decodeCursor(partial)).toBeNull()
  })

  it('returns null for non-string field types', () => {
    const wrongTypes = Buffer.from(
      JSON.stringify({ created_at: 123, id: true }),
      'utf8',
    ).toString('base64')
    expect(decodeCursor(wrongTypes)).toBeNull()
  })

  it('returns null for undefined / null / empty input', () => {
    expect(decodeCursor(undefined)).toBeNull()
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor('')).toBeNull()
  })
})

describe('clampLimit', () => {
  it('returns the default when input is undefined', () => {
    expect(clampLimit(undefined)).toBe(25)
  })

  it('clamps values above the max to the max', () => {
    expect(clampLimit(500)).toBe(100)
  })

  it('returns the default for non-positive values', () => {
    expect(clampLimit(0)).toBe(25)
    expect(clampLimit(-5)).toBe(25)
  })

  it('passes through valid values', () => {
    expect(clampLimit(50)).toBe(50)
    expect(clampLimit(1)).toBe(1)
    expect(clampLimit(100)).toBe(100)
  })

  it('floors fractional values', () => {
    expect(clampLimit(12.9)).toBe(12)
  })
})
