// GET /api/price-book — structured, paginated price-book export for
// first-party programmatic consumers (e.g. Thumb Scrap) building quotes.
//
// Unlike the `list_services` MCP tool (lib/agent-tools/query-company-data.ts),
// which is built for LLM chat consumption — prose lines, capped at 25 items,
// and only `id, name, unit, unit_price, currency_code` — this endpoint returns
// the full price-book column set with real, complete pagination. Do not change
// `list_services`; it is correct for its own purpose.
//
// Auth: reuses the exact same Bearer-token path as /api/mcp — `verifyMcpRequest`
// resolves the token via `resolveAccessToken` (oauth_access_tokens), and
// `requireScope` gates on the `mcp:read` scope. No separate API-key system.
//
// Tenant isolation: rows are scoped exclusively by `auth.company_id`, the
// company_id carried on the resolved TOKEN. The request never supplies (and
// this handler never reads) a company_id from query params or body — that is
// the one input that must never cross from caller to query.
//
// Pagination: keyset over `(name ASC, id ASC)` — `company_price_book.name` is
// NOT NULL, and `id` breaks ties, so the pair is a stable, gapless cursor even
// under concurrent inserts. The cursor is an opaque base64 JSON `{ name, id }`,
// mirroring the shape (not the reused code) of lib/mcp/pagination.ts, which is
// keyed on `created_at` and is MCP-tool-specific.

import { verifyMcpRequest } from '@/lib/mcp/auth'
import { requireScope } from '@/lib/mcp/scope'
import { requireServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

const NO_STORE_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
}

interface PriceBookCursor {
  name: string
  id: string
}

/** Encode a (name, id) tuple into an opaque base64 JSON cursor string. */
function encodeCursor(row: PriceBookCursor): string {
  return Buffer.from(JSON.stringify({ name: row.name, id: row.id }), 'utf8').toString('base64')
}

/**
 * Decode an opaque cursor back into `{ name, id }`. Returns `null` for any
 * malformed/partial input — callers treat that as "start from the beginning"
 * rather than throwing, since the cursor is caller-supplied.
 */
function decodeCursor(cursor: string | null): PriceBookCursor | null {
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
    typeof (parsed as Record<string, unknown>).name !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    return null
  }
  const p = parsed as Record<string, string>
  return { name: p.name, id: p.id }
}

/** Clamp + default a `limit` query param to [1, MAX_LIMIT], default DEFAULT_LIMIT. */
function clampLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  if (n > MAX_LIMIT) return MAX_LIMIT
  return n
}

function jsonError(
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...NO_STORE_HEADERS,
      ...extraHeaders,
    },
  })
}

interface PriceBookRow {
  id: string
  name: string
  unit: string | null
  unit_price: number
  pricing_type: string
  base_price: number | null
  price_per_unit: number | null
  minimum_price: number | null
  area_sizes: unknown
  currency_code: string
  notes: string | null
}

const SELECT_COLUMNS =
  'id, name, unit, unit_price, pricing_type, base_price, price_per_unit, minimum_price, area_sizes, currency_code, notes'

export async function GET(req: Request): Promise<Response> {
  const verified = await verifyMcpRequest(req)
  if (!verified.ok) {
    return jsonError(
      verified.status,
      { error: verified.error, error_description: 'Bearer access token is missing or invalid' },
      verified.headers,
    )
  }

  const scopeCheck = requireScope(verified.auth, 'mcp:read')
  if (!scopeCheck.ok) {
    return jsonError(scopeCheck.status, {
      error: scopeCheck.error,
      message: scopeCheck.message,
    })
  }

  const { searchParams } = new URL(req.url)
  const limit = clampLimit(searchParams.get('limit'))
  const cursor = decodeCursor(searchParams.get('cursor'))

  const supabase = requireServiceClient()
  let query = supabase
    .from('company_price_book')
    .select(SELECT_COLUMNS)
    // company_id comes ONLY from the resolved token — never from request input.
    .eq('company_id', verified.auth.company_id)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (cursor) {
    // Quote both values (PostgREST convention for values that may contain
    // reserved chars like commas/periods/parens) and escape embedded quotes.
    //
    // Backslashes MUST be escaped before quotes. read.ts's applyCursor escapes
    // only quotes, which is safe there because it keys on a machine-generated
    // uuid — but `name` is free text the owner types. A name ending in a
    // backslash would otherwise escape the closing quote and silently corrupt
    // the filter expression, dropping or repeating rows mid-pagination. Silent
    // truncation is the exact bug this endpoint exists to avoid.
    const escapeFilterValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const escapedName = escapeFilterValue(cursor.name)
    const escapedId = escapeFilterValue(cursor.id)
    query = query.or(
      `name.gt."${escapedName}",and(name.eq."${escapedName}",id.gt."${escapedId}")`,
    )
  }

  const { data, error } = await query
  if (error) {
    return jsonError(500, { error: 'internal_error', message: 'Failed to load price book' })
  }

  const rows = (data ?? []) as PriceBookRow[]
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const lastItem = items[items.length - 1]
  const next_cursor = hasMore && lastItem ? encodeCursor({ name: lastItem.name, id: lastItem.id }) : null

  return new Response(JSON.stringify({ items, next_cursor }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...NO_STORE_HEADERS,
    },
  })
}
