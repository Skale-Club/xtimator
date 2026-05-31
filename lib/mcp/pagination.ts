// Phase 88: keyset pagination helpers for MCP read tools.
//
// MCP tools return paginated results as `{ items, nextCursor? }` where
// `nextCursor` is an opaque base64-encoded JSON tuple `{ created_at, id }`.
// Sorting is always (created_at DESC, id DESC) so the (created_at, id) pair
// uniquely identifies a row and is stable under concurrent inserts.
//
// We never expose offsets to MCP clients — they would be racey under inserts
// and Claude.ai treats `nextCursor` as opaque anyway.

export interface CursorPayload {
  created_at: string
  id: string
}

/**
 * Encode a (created_at, id) tuple into an opaque base64 JSON string.
 * Returned to MCP clients as `nextCursor`.
 */
export function encodeCursor(row: CursorPayload): string {
  const json = JSON.stringify({ created_at: row.created_at, id: row.id })
  return Buffer.from(json, 'utf8').toString('base64')
}

/**
 * Decode a base64-encoded cursor back into its `{ created_at, id }` payload.
 * Returns `null` for any malformed or partial input — callers should treat
 * a null result as "no cursor / start from the beginning" rather than throw.
 */
export function decodeCursor(cursor: string | undefined | null): CursorPayload | null {
  if (!cursor) return null
  let raw: string
  try {
    raw = Buffer.from(cursor, 'base64').toString('utf8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).created_at !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    return null
  }

  const p = parsed as Record<string, string>
  return { created_at: p.created_at, id: p.id }
}

/**
 * Clamp + default for a `limit` argument.
 * Default 25, max 100. Negative / NaN values fall back to the default.
 */
export function clampLimit(raw: number | undefined | null, fallback = 25, max = 100): number {
  if (raw === undefined || raw === null || Number.isNaN(raw)) return fallback
  const n = Math.floor(raw)
  if (n < 1) return fallback
  if (n > max) return max
  return n
}
